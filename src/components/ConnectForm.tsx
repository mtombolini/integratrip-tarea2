"use client";

import { useState } from "react";
import type { AuthType } from "@/lib/oauth/types";

/** One-click connect for a known server: POSTs to /api/connections → AS. */
export function ConnectButton(props: {
  name: string;
  serverUrl: string;
  authType: AuthType;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [submitting, setSubmitting] = useState(false);
  const primary = (props.variant ?? "primary") === "primary";
  return (
    <form
      action="/api/connections"
      method="post"
      onSubmit={() => setSubmitting(true)}
    >
      <input type="hidden" name="authType" value={props.authType} />
      <input type="hidden" name="serverUrl" value={props.serverUrl} />
      <input type="hidden" name="name" value={props.name} />
      <button
        type="submit"
        disabled={submitting}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
          primary
            ? "bg-slate-900 text-white hover:bg-slate-700"
            : "border border-slate-300 text-slate-700 hover:bg-slate-100"
        }`}
      >
        {submitting ? "Redirigiendo…" : (props.label ?? "Conectar")}
      </button>
    </form>
  );
}

// Arbitrary MCP URL with an explicit auth mechanism.
export function CustomConnectForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [authType, setAuthType] = useState<AuthType>("dcr");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
      >
        + Conectar otro servidor MCP por URL
      </button>
    );
  }

  return (
    <form
      action="/api/connections"
      method="post"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium">Servidor MCP personalizado</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          Cancelar
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Nombre</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mi servidor MCP"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Mecanismo de autenticación
          </span>
          <select
            name="authType"
            value={authType}
            onChange={(e) => setAuthType(e.target.value as AuthType)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="pre">PRE — Pre-Registered Client</option>
            <option value="dcr">DCR — Dynamic Client Registration</option>
            <option value="cimd">CIMD — Client ID Metadata Document</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">
            URL del MCP
          </span>
          <input
            name="serverUrl"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://…/mcp"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={!serverUrl}
        className="mt-5 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Conectar
      </button>
    </form>
  );
}
