"use client";

import { useState } from "react";
import type { UiFunctionCall, UiFunctionResult } from "@/lib/chats/types";

export type CallInfo = {
  serverName?: string;
  toolName?: string;
  durationMs?: number;
};

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return "{…}";
  return String(v);
}

/** "origin=SCL · destination=CUN · passengers=2" */
function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return scalar(args);
  const parts = Object.entries(args as Record<string, unknown>).map(
    ([k, v]) => `${k}=${scalar(v)}`,
  );
  return parts.length ? parts.join(" · ") : "sin argumentos";
}

/** One-line gist of a tool result: error text, confirmation IDs, list sizes. */
function summarizeResult(result: UiFunctionResult): string {
  const r = (result.result ?? {}) as Record<string, unknown>;
  if (result.isError) {
    const msg = r.error ?? r.message ?? r.text ?? JSON.stringify(r);
    return String(msg).slice(0, 200);
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "string" && /confirm|booking/i.test(k))
      parts.push(`${k}: ${v}`);
  }
  if (typeof r.status === "string") parts.push(`status: ${r.status}`);
  for (const [k, v] of Object.entries(r)) {
    if (Array.isArray(v)) parts.push(`${v.length} ${k}`);
  }
  if (parts.length) return parts.join(" · ");
  if (typeof r.text === "string") return r.text.slice(0, 200);
  return JSON.stringify(r).slice(0, 200);
}

/** Visible trace of one tool call: name, server, arguments and result/error. */
export function ToolCallCard({
  call,
  result,
  info,
  pending,
}: {
  call: UiFunctionCall;
  result?: UiFunctionResult;
  info?: CallInfo;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const state = result
    ? result.isError
      ? "error"
      : "ok"
    : pending
      ? "running"
      : "missing";

  const dot = {
    ok: "bg-emerald-500",
    error: "bg-red-500",
    running: "bg-amber-400 animate-pulse",
    missing: "bg-slate-300",
  }[state];
  const label = {
    ok: "OK",
    error: "Error",
    running: "Ejecutando…",
    missing: "Sin resultado",
  }[state];

  return (
    <div
      className={`rounded-lg border text-sm ${
        state === "error"
          ? "border-red-200 bg-red-50/60"
          : "border-slate-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="text-xs text-slate-500">🔧</span>
        <span className="truncate font-mono text-xs font-medium">
          {call.name}
        </span>
        {info?.serverName && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {info.serverName}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11px] text-slate-500">
          {label}
          {info?.durationMs !== undefined && result
            ? ` · ${info.durationMs} ms`
            : ""}
        </span>
        <span className="shrink-0 text-xs text-slate-400">
          {open ? "Ocultar ▾" : "Detalle ▸"}
        </span>
      </button>
      <div className="space-y-1 px-3 pb-2 pl-7 font-mono text-[11px] leading-relaxed">
        <p className="break-words text-slate-600">
          <span className="text-slate-400">args </span>
          {summarizeArgs(call.arguments)}
        </p>
        {result && (
          <p
            className={`break-words ${result.isError ? "text-red-700" : "text-emerald-700"}`}
          >
            <span className="text-slate-400">
              {result.isError ? "error " : "→ "}
            </span>
            {summarizeResult(result)}
          </p>
        )}
      </div>
      {open && (
        <div className="space-y-2 border-t border-slate-200 px-3 py-3">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Argumentos
            </p>
            <Json value={call.arguments} />
          </div>
          {result && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {result.isError ? "Error" : "Resultado"}
              </p>
              <Json value={result.result} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
