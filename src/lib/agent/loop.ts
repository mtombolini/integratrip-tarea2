import { randomUUID } from "node:crypto";
import { callTool } from "@/lib/mcp/client";
import { generate, LlmError, type StudentIdentity } from "@/lib/llm/client";
import type { LlmFunctionCall, LlmMessage } from "@/lib/llm/types";
import {
  appendMessage,
  listMessages,
  nextSeq,
  recordInvocations,
  touchChat,
  type NewInvocation,
} from "@/lib/chats/repo";
import type {
  ChatMessage,
  StoredFunctionCall,
  StoredFunctionResult,
} from "@/lib/db/schema";
import { buildCatalog, toLlmTools, type Catalog } from "./catalog";
import { systemPreamble } from "./prompt";

export const MAX_TURNS = 12;
const MAX_RESULT_CHARS = 30_000;

export type AgentEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "status"; text: string }
  | { type: "catalog"; tools: number; warnings: Catalog["warnings"] };

type Emit = (event: AgentEvent) => void;

// ── History <-> LLM messages ───────────────────────────────────────────────

function toLlmMessage(m: ChatMessage): LlmMessage {
  switch (m.role) {
    case "user":
      return { role: "USER", text: m.text ?? "" };
    case "model":
      return {
        role: "MODEL",
        text: m.text ?? "",
        functionCalls: (m.functionCalls ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          argumentsJson: JSON.stringify(c.arguments ?? {}),
        })),
      };
    case "tool":
      return {
        role: "TOOL",
        functionResults: (m.functionResults ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          resultJson: JSON.stringify(r.result ?? {}),
          isError: r.isError,
        })),
      };
    case "error":
      // Keeps USER/MODEL alternation valid after an interrupted turn.
      return {
        role: "MODEL",
        text: `(La respuesta anterior se interrumpió: ${m.text ?? "error"})`,
      };
  }
}

// ── Tool execution ─────────────────────────────────────────────────────────

function parseArgs(json: string): Record<string, unknown> {
  if (!json) return {};
  const v = JSON.parse(json);
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

type McpResult = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

/** Compact JSON object for the model from an MCP CallToolResult. */
function toModelPayload(result: McpResult): Record<string, unknown> {
  let value: unknown = result.structuredContent;
  if (value === undefined) {
    const text = (result.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");
    try {
      value = JSON.parse(text);
    } catch {
      value = { text };
    }
  }
  const obj =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { result: value };
  const json = JSON.stringify(obj);
  if (json.length <= MAX_RESULT_CHARS) return obj;
  return { truncated: true, partial: json.slice(0, MAX_RESULT_CHARS) };
}

async function executeCall(
  userId: string,
  catalog: Catalog,
  call: StoredFunctionCall,
): Promise<{ result: StoredFunctionResult; invocation: Omit<NewInvocation, "chatId" | "messageId"> }> {
  const entry = catalog.byName.get(call.name);
  const started = Date.now();
  const base = {
    callId: call.id,
    exposedName: call.name,
    arguments: call.arguments ?? {},
  };

  if (!entry) {
    const payload = { error: `La tool ${call.name} no existe en el catálogo.` };
    return {
      result: { id: call.id, name: call.name, result: payload, isError: true },
      invocation: {
        ...base,
        toolName: call.name,
        connectionId: null,
        serverName: "desconocido",
        result: payload,
        isError: true,
        durationMs: 0,
      },
    };
  }

  let payload: Record<string, unknown>;
  let raw: unknown;
  let isError: boolean;
  try {
    const res = (await callTool(
      userId,
      entry.connectionId,
      entry.toolName,
      (call.arguments ?? {}) as Record<string, unknown>,
    )) as McpResult;
    raw = res;
    isError = Boolean(res.isError);
    payload = toModelPayload(res);
  } catch (err) {
    isError = true;
    payload = { error: err instanceof Error ? err.message : String(err) };
    raw = payload;
  }

  return {
    result: { id: call.id, name: call.name, result: payload, isError },
    invocation: {
      ...base,
      toolName: entry.toolName,
      connectionId: entry.connectionId,
      serverName: entry.serverName,
      result: raw as object,
      isError,
      durationMs: Date.now() - started,
    },
  };
}

// ── Loop ───────────────────────────────────────────────────────────────────

// The proxy intermittently fails with INTERNAL ("Gemini returned an empty
// response"), mostly right after a TOOL message. One immediate retry of that
// single turn recovers it; anything else (incl. RESOURCE_EXHAUSTED) is never
// retried and goes straight to the user.
async function generateTurn(
  identity: StudentIdentity,
  messages: LlmMessage[],
  tools: ReturnType<typeof toLlmTools>,
  emit: Emit,
) {
  try {
    return await generate(identity, messages, tools);
  } catch (err) {
    if (!(err instanceof LlmError) || err.code !== "INTERNAL") throw err;
    emit({ type: "status", text: "El modelo devolvió una respuesta vacía; reintentando una vez…" });
    return generate(identity, messages, tools);
  }
}

function errorText(err: unknown): { code: string; text: string } {
  if (err instanceof LlmError) {
    const friendly: Record<string, string> = {
      RESOURCE_EXHAUSTED:
        "Se alcanzó el límite de uso del modelo (12 llamadas por minuto). Espera un momento y vuelve a enviar tu mensaje.",
      UNAUTHENTICATED: "El proxy LLM rechazó la autenticación (falta metadata).",
      PERMISSION_DENIED: "El email / número de alumno no está autorizado en el proxy LLM.",
      INVALID_ARGUMENT: `El proxy LLM rechazó la solicitud: ${err.message}`,
      INTERNAL: "El modelo tuvo un error interno. Intenta de nuevo.",
      UNAVAILABLE: "El proxy LLM no está disponible en este momento.",
      DEADLINE_EXCEEDED: "El modelo tardó demasiado en responder.",
    };
    return { code: err.code, text: friendly[err.code] ?? err.message };
  }
  return { code: "UNKNOWN", text: err instanceof Error ? err.message : String(err) };
}

/**
 * Runs one user message through the agent loop: appends USER, then up to
 * MAX_TURNS Generate calls, executing every function_call against its MCP
 * before the next Generate. Every step is persisted as it happens, so the
 * chat can be resumed with the exact same context.
 */
export async function runAgent(opts: {
  userId: string;
  chatId: string;
  identity: StudentIdentity;
  text: string;
  emit: Emit;
}): Promise<void> {
  const { userId, chatId, identity, emit } = opts;

  const history = await listMessages(chatId);
  let seq = await nextSeq(chatId);
  const messages: LlmMessage[] = history.map(toLlmMessage);

  const persist = async (m: Omit<Parameters<typeof appendMessage>[0], "chatId" | "seq">) => {
    const row = await appendMessage({ ...m, chatId, seq: seq++ });
    emit({ type: "message", message: row });
    return row;
  };

  await persist({ role: "user", text: opts.text });
  messages.push({ role: "USER", text: opts.text });

  try {
    emit({ type: "status", text: "Cargando tools de los MCP conectados…" });
    const catalog = await buildCatalog(userId);
    emit({ type: "catalog", tools: catalog.entries.length, warnings: catalog.warnings });
    const tools = toLlmTools(catalog);
    const preamble = systemPreamble(catalog);

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      emit({ type: "status", text: `Pensando… (turno ${turn}/${MAX_TURNS})` });
      const resp = await generateTurn(identity, [...preamble, ...messages], tools, emit);
      const meta = {
        model: resp.model,
        latencyMs: resp.latencyMs,
        usage: resp.usage,
        turn,
      };

      const calls: StoredFunctionCall[] = (resp.functionCalls ?? []).map(
        (c: LlmFunctionCall) => ({
          id: c.id || `call_${randomUUID().slice(0, 8)}`,
          name: c.name,
          arguments: (() => {
            try {
              return parseArgs(c.argumentsJson);
            } catch {
              return {};
            }
          })(),
        }),
      );

      if (calls.length === 0) {
        await persist({ role: "model", text: resp.text ?? "", meta });
        return;
      }

      const modelRow = await persist({
        role: "model",
        text: resp.text || null,
        functionCalls: calls,
        meta,
      });
      messages.push(toLlmMessage(modelRow));

      // Run every requested call before the next Generate (sequentially, so
      // dependent bookings never race).
      const results: StoredFunctionResult[] = [];
      const invocations: NewInvocation[] = [];
      const callMeta: Record<string, unknown> = {};
      for (const call of calls) {
        const entry = catalog.byName.get(call.name);
        emit({
          type: "status",
          text: `Ejecutando ${call.name}${entry ? ` en ${entry.serverName}` : ""}…`,
        });
        const { result, invocation } = await executeCall(userId, catalog, call);
        results.push(result);
        invocations.push({ ...invocation, chatId, messageId: modelRow.id });
        callMeta[call.id] = {
          serverName: invocation.serverName,
          toolName: invocation.toolName,
          durationMs: invocation.durationMs,
        };
      }

      const toolRow = await persist({
        role: "tool",
        functionResults: results,
        meta: { calls: callMeta },
      });
      await recordInvocations(invocations);
      messages.push(toLlmMessage(toolRow));
    }

    await persist({
      role: "error",
      text: `Se alcanzó el máximo de ${MAX_TURNS} turnos sin una respuesta final. Envía otro mensaje para continuar.`,
      meta: { code: "MAX_TURNS" },
    });
  } catch (err) {
    const { code, text } = errorText(err);
    await persist({ role: "error", text, meta: { code } });
  } finally {
    await touchChat(chatId);
  }
}
