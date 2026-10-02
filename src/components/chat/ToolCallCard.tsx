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
  const state = result ? (result.isError ? "error" : "ok") : pending ? "running" : "missing";

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
        state === "error" ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="text-xs text-slate-500">🔧</span>
        <span className="truncate font-mono text-xs font-medium">{call.name}</span>
        {info?.serverName && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {info.serverName}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11px] text-slate-500">
          {label}
          {info?.durationMs !== undefined && result ? ` · ${info.durationMs} ms` : ""}
        </span>
        <span className="shrink-0 text-xs text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
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
