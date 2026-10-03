"use client";

import { useEffect, useState } from "react";
import type { CatalogTool } from "@/lib/chats/types";

type Warning = { serverName: string; message: string };

/** Catalog of tools the agent can use (name, server, description, inputSchema). */
export function CatalogPanel({ onClose }: { onClose: () => void }) {
  const [tools, setTools] = useState<CatalogTool[] | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error ?? "No se pudo cargar el catálogo");
        if (cancelled) return;
        setTools(data.tools);
        setWarnings(data.warnings ?? []);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200 bg-white md:w-96">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold">
          Tools disponibles{tools ? ` (${tools.length})` : ""}
        </h2>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {!tools && !error && (
          <p className="text-sm text-slate-500">Cargando…</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {warnings.map((w) => (
          <p
            key={w.serverName}
            className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
          >
            {w.serverName}: no se pudieron listar sus tools ({w.message}).
            Revisa la conexión en Configuración.
          </p>
        ))}
        {tools?.length === 0 && (
          <p className="text-sm text-slate-500">
            No hay tools. Conecta servidores MCP en Configuración.
          </p>
        )}
        {tools?.map((t) => (
          <div key={t.name} className="rounded-md border border-slate-200 p-3">
            <button
              className="w-full text-left"
              onClick={() => setExpanded((v) => (v === t.name ? null : t.name))}
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-xs font-medium">
                  {t.name}
                </span>
                <span className="ml-auto shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {t.serverName}
                </span>
              </div>
              {t.description && (
                <p className="mt-1 text-xs text-slate-500">{t.description}</p>
              )}
            </button>
            {expanded === t.name && (
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-100">
                {JSON.stringify(t.inputSchema, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
