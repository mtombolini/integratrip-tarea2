import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/repo";
import { AUTH_TYPE_LABELS, MCP_SERVER_PRESETS } from "@/config/mcp-servers";
import { ConnectButton, CustomConnectForm } from "@/components/ConnectForm";
import { DeleteConnectionButton } from "@/components/DeleteConnectionButton";

const PRESET_ICON: Record<
  string,
  { emoji: string; bg: string; label: string }
> = {
  "andes-air": { emoji: "✈️", bg: "bg-rose-50", label: "Vuelos" },
  staywell: { emoji: "🏨", bg: "bg-sky-50", label: "Hoteles" },
  "cielo-sur": { emoji: "⛅", bg: "bg-amber-50", label: "Clima" },
};

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Conectado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> No conectado
    </span>
  );
}

export default async function SettingsPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { error } = await props.searchParams;
  const connections = await listConnections(session.uid);
  const presetUrls = new Set(MCP_SERVER_PRESETS.map((p) => p.mcpUrl));
  const custom = connections.filter((c) => !presetUrls.has(c.resourceUrl));
  const connectedCount = MCP_SERVER_PRESETS.filter((p) =>
    connections.some((c) => c.resourceUrl === p.mcpUrl),
  ).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-slate-600">
          Conecta los servidores MCP que el agente del{" "}
          <Link
            href="/chat"
            className="font-medium text-slate-900 underline underline-offset-2"
          >
            Chat
          </Link>{" "}
          usará como tools. Cada conexión usa un mecanismo OAuth distinto.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo completar la operación: {error}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Servidores del curso
          </h2>
          <span className="text-xs text-slate-500">
            {connectedCount} de {MCP_SERVER_PRESETS.length} conectados
          </span>
        </div>

        <ul className="space-y-3">
          {MCP_SERVER_PRESETS.map((p) => {
            const conn = connections.find((c) => c.resourceUrl === p.mcpUrl);
            const icon = PRESET_ICON[p.key];
            return (
              <li
                key={p.key}
                className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${icon?.bg ?? "bg-slate-50"}`}
                >
                  {icon?.emoji ?? "🔌"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {AUTH_TYPE_LABELS[p.authType]}
                    </span>
                    <StatusBadge connected={Boolean(conn)} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{p.description}</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                    {p.mcpUrl}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {conn ? (
                    <>
                      <Link
                        href={`/dashboard/connections/${conn.id}`}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                      >
                        Ver tools
                      </Link>
                      <DeleteConnectionButton id={conn.id} />
                    </>
                  ) : (
                    <ConnectButton
                      name={p.name}
                      serverUrl={p.mcpUrl}
                      authType={p.authType}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Otros servidores
        </h2>
        {custom.length > 0 && (
          <ul className="mb-4 space-y-3">
            {custom.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-2xl">
                  🔌
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {AUTH_TYPE_LABELS[c.authType]}
                    </span>
                    <StatusBadge connected />
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                    {c.resourceUrl}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/dashboard/connections/${c.id}`}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    Ver tools
                  </Link>
                  <DeleteConnectionButton id={c.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <CustomConnectForm />
      </section>
    </div>
  );
}
