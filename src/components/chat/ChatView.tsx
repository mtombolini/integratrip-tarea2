"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UiFunctionResult, UiMessage } from "@/lib/chats/types";
import { useChats } from "@/components/app/ChatsContext";
import { Markdown } from "./Markdown";
import { ToolCallCard, type CallInfo } from "./ToolCallCard";
import { CatalogPanel } from "./CatalogPanel";

type StreamEvent =
  | { type: "chat"; chat: { id: string; title: string } }
  | { type: "message"; message: UiMessage }
  | { type: "status"; text: string }
  | {
      type: "catalog";
      tools: number;
      warnings: { serverName: string; message: string }[];
    }
  | { type: "fatal"; error: string }
  | { type: "done" };

const SUGGESTIONS = [
  "Quiero planificar 5 días en Cancún para 2 personas saliendo desde Santiago.",
  "¿Qué vuelos hay de Santiago a Cusco la próxima semana?",
  "Necesito hotel en Buenos Aires y saber qué clima hará.",
];

export function ChatView(props: {
  chatId: string | null;
  messages: UiMessage[];
}) {
  const { chats, upsertChat, newChatSignal } = useChats();
  const [chatId, setChatId] = useState(props.chatId);
  const [messages, setMessages] = useState(props.messages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstSignal = useRef(newChatSignal);

  // "Nueva conversación" from the sidebar: start over with an empty context.
  useEffect(() => {
    if (newChatSignal === firstSignal.current) return;
    firstSignal.current = newChatSignal;
    setChatId(null);
    setMessages([]);
    setNotice(null);
    setInput("");
  }, [newChatSignal]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Results and server info for every call, keyed by call id.
  const { results, infos } = useMemo(() => {
    const results = new Map<string, UiFunctionResult>();
    const infos = new Map<string, CallInfo>();
    for (const m of messages) {
      if (m.role !== "tool") continue;
      for (const r of m.functionResults ?? []) results.set(r.id, r);
      const calls = (m.meta?.calls ?? {}) as Record<string, CallInfo>;
      for (const [id, info] of Object.entries(calls)) infos.set(id, info);
    }
    return { results, infos };
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setNotice(null);
    setStatus("Enviando…");
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chatId ?? undefined, text: trimmed }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handle(JSON.parse(line) as StreamEvent);
        }
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Error de red");
      setInput(trimmed);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  function handle(ev: StreamEvent) {
    switch (ev.type) {
      case "chat": {
        setChatId(ev.chat.id);
        upsertChat(ev.chat);
        if (window.location.pathname !== `/chat/${ev.chat.id}`) {
          window.history.replaceState(null, "", `/chat/${ev.chat.id}`);
        }
        break;
      }
      case "message":
        setMessages((ms) =>
          ms.some((m) => m.id === ev.message.id) ? ms : [...ms, ev.message],
        );
        break;
      case "status":
        setStatus(ev.text);
        break;
      case "catalog":
        if (ev.warnings.length > 0) {
          setNotice(
            `Algunos MCP no respondieron: ${ev.warnings.map((w) => w.serverName).join(", ")}. Revisa Configuración.`,
          );
        }
        break;
      case "fatal":
        setNotice(ev.error);
        break;
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-6">
          <h1 className="truncate text-sm font-semibold text-slate-800">
            {chats.find((c) => c.id === chatId)?.title ?? "Nueva conversación"}
          </h1>
          <button
            onClick={() => setShowCatalog((v) => !v)}
            className={`ml-auto rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showCatalog
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
          >
            🔧 Tools disponibles
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
            {messages.length === 0 && !busy && (
              <div className="py-16 text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-2xl">
                  ✈️
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  ¿A dónde quieres viajar?
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  El agente busca vuelos, hoteles y clima en tus MCP conectados,
                  y te pide confirmación antes de reservar.
                </p>
                <div className="mt-8 grid gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-400 hover:shadow"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm text-white shadow-sm">
                      {m.text}
                    </div>
                  </div>
                );
              }
              if (m.role === "model") {
                const calls = m.functionCalls ?? [];
                return (
                  <div key={m.id} className="flex gap-3">
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 text-[11px] font-bold text-white">
                      IT
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      {m.text && (
                        <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <Markdown text={m.text} />
                        </div>
                      )}
                      {calls.map((c) => (
                        <ToolCallCard
                          key={c.id}
                          call={c}
                          result={results.get(c.id)}
                          info={infos.get(c.id)}
                          pending={busy}
                        />
                      ))}
                      {!m.text && calls.length === 0 && (
                        <p className="text-sm italic text-slate-400">
                          (sin respuesta)
                        </p>
                      )}
                    </div>
                  </div>
                );
              }
              if (m.role === "error") {
                const rateLimited = m.meta?.code === "RESOURCE_EXHAUSTED";
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      rateLimited
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {rateLimited ? "⏳ " : "⚠️ "}
                    {m.text}
                  </div>
                );
              }
              return null; // tool rows are rendered inside their ToolCallCard
            })}

            {busy && status && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                {status}
              </div>
            )}
            {notice && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {notice}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-slate-200 bg-white px-4 py-3"
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Escribe tu mensaje… (Enter para enviar, Shift+Enter para salto de línea)"
              className="max-h-40 min-h-[44px] flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-500 focus:outline-none"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-40"
            >
              {busy ? "…" : "Enviar"}
            </button>
          </div>
        </form>
      </section>

      {showCatalog && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/20 md:static md:z-auto md:bg-transparent">
          <CatalogPanel onClose={() => setShowCatalog(false)} />
        </div>
      )}
    </div>
  );
}
