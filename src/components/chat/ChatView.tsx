"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { UiChat, UiFunctionResult, UiMessage } from "@/lib/chats/types";
import { Markdown } from "./Markdown";
import { ToolCallCard, type CallInfo } from "./ToolCallCard";
import { CatalogPanel } from "./CatalogPanel";

type StreamEvent =
  | { type: "chat"; chat: { id: string; title: string } }
  | { type: "message"; message: UiMessage }
  | { type: "status"; text: string }
  | { type: "catalog"; tools: number; warnings: { serverName: string; message: string }[] }
  | { type: "fatal"; error: string }
  | { type: "done" };

const SUGGESTIONS = [
  "Quiero planificar 5 días en Cancún para 2 personas saliendo desde Santiago.",
  "¿Qué vuelos hay de Santiago a Cusco la próxima semana?",
  "Necesito hotel en Buenos Aires y saber qué clima hará.",
];

export function ChatView(props: {
  chats: UiChat[];
  chatId: string | null;
  messages: UiMessage[];
}) {
  const router = useRouter();
  const [chats, setChats] = useState(props.chats);
  const [chatId, setChatId] = useState(props.chatId);
  const [messages, setMessages] = useState(props.messages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  function startNewChat() {
    setChatId(null);
    setMessages([]);
    setNotice(null);
    setShowSidebar(false);
    router.push("/chat");
  }

  async function removeChat(id: string) {
    if (!confirm("¿Eliminar esta conversación?")) return;
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    setChats((cs) => cs.filter((c) => c.id !== id));
    if (id === chatId) startNewChat();
  }

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
        const now = new Date().toISOString();
        setChatId(ev.chat.id);
        setChats((cs) => [
          { id: ev.chat.id, title: ev.chat.title, updatedAt: now },
          ...cs.filter((c) => c.id !== ev.chat.id),
        ]);
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

  const sidebar = (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="p-3">
        <button
          onClick={startNewChat}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          + Nueva conversación
        </button>
      </div>
      <p className="px-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Tus conversaciones
      </p>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {chats.length === 0 && (
          <li className="px-2 py-2 text-xs text-slate-400">Aún no hay conversaciones.</li>
        )}
        {chats.map((c) => (
          <li key={c.id} className="group flex items-center">
            <Link
              href={`/chat/${c.id}`}
              onClick={() => setShowSidebar(false)}
              className={`min-w-0 flex-1 truncate rounded-md px-2 py-2 text-sm ${
                c.id === chatId
                  ? "bg-slate-100 font-medium text-slate-900"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {c.title}
            </Link>
            <button
              onClick={() => removeChat(c.id)}
              title="Eliminar"
              className="ml-1 hidden rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:block"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="hidden md:flex">{sidebar}</div>
      {showSidebar && (
        <div className="fixed inset-0 z-30 flex md:hidden">
          {sidebar}
          <button className="flex-1 bg-black/30" onClick={() => setShowSidebar(false)} />
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <button
            onClick={() => setShowSidebar(true)}
            className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 md:hidden"
          >
            ☰
          </button>
          <h1 className="truncate text-sm font-medium text-slate-700">
            {chats.find((c) => c.id === chatId)?.title ?? "Nueva conversación"}
          </h1>
          <button
            onClick={() => setShowCatalog((v) => !v)}
            className="ml-auto rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            🔧 Tools
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
            {messages.length === 0 && !busy && (
              <div className="py-16 text-center">
                <h2 className="text-2xl font-semibold tracking-tight">
                  ¿A dónde quieres viajar?
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  El agente busca vuelos, hoteles y clima en tus MCP conectados, y te pide
                  confirmación antes de reservar.
                </p>
                <div className="mt-8 grid gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 hover:border-slate-400"
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
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm text-white">
                      {m.text}
                    </div>
                  </div>
                );
              }
              if (m.role === "model") {
                const calls = m.functionCalls ?? [];
                return (
                  <div key={m.id} className="space-y-2">
                    {m.text && (
                      <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3">
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
                      <p className="text-sm italic text-slate-400">(sin respuesta)</p>
                    )}
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
