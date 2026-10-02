import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createChat, getChat } from "@/lib/chats/repo";
import { resolveIdentity, LlmError } from "@/lib/llm/client";
import { runAgent, type AgentEvent } from "@/lib/agent/loop";

// Agent runs can take a while (several model turns + MCP calls).
export const maxDuration = 300;

const bodySchema = z.object({
  chatId: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(4000),
});

// One agent run per chat at a time (per process): avoids interleaved history.
const running = new Set<string>();

type StreamEvent =
  | AgentEvent
  | { type: "chat"; chat: { id: string; title: string } }
  | { type: "fatal"; error: string }
  | { type: "done" };

/**
 * Sends a user message and streams the agent's progress as NDJSON: each
 * persisted message (USER, MODEL + function_calls, TOOL results, final text
 * or error) plus transient status lines. "Nueva conversación" = no chatId.
 */
export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const { text } = parsed.data;

  let identity;
  try {
    identity = resolveIdentity(session);
  } catch (err) {
    const msg = err instanceof LlmError ? err.message : "llm_identity_missing";
    return Response.json({ error: msg }, { status: 500 });
  }

  const chat = parsed.data.chatId
    ? await getChat(session.uid, parsed.data.chatId)
    : await createChat(session.uid, text.replace(/\s+/g, " ").slice(0, 80));
  if (!chat) return Response.json({ error: "chat_not_found" }, { status: 404 });

  if (running.has(chat.id)) {
    return Response.json(
      { error: "Ya hay una respuesta en curso en este chat." },
      { status: 409 },
    );
  }
  running.add(chat.id);

  const chatId = chat.id;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: StreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false; // client went away; the run keeps going and persists
        }
      };

      send({ type: "chat", chat: { id: chatId, title: chat.title } });
      try {
        await runAgent({
          userId: session.uid,
          chatId,
          identity,
          text,
          emit: send,
        });
      } catch (err) {
        send({ type: "fatal", error: err instanceof Error ? err.message : "agent_failed" });
      } finally {
        running.delete(chatId);
        send({ type: "done" });
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
