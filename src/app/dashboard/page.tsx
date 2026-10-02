import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/repo";
import { AUTH_TYPE_LABELS } from "@/config/mcp-servers";
import { ConnectForm } from "@/components/ConnectForm";
import { DeleteConnectionButton } from "@/components/DeleteConnectionButton";
import { AppHeader } from "@/components/AppHeader";

export default async function DashboardPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { error } = await props.searchParams;
  const connections = await listConnections(session.uid);

  return (
    <main className="flex flex-1 flex-col">
      <AppHeader email={session.email} active="settings" />

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {error && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            No se pudo completar la operación: {error}
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
          <p className="mt-1 text-sm text-slate-600">
            Los MCP que conectes aquí quedan disponibles como tools para el agente
            del{" "}
            <Link href="/chat" className="font-medium underline underline-offset-2">
              Chat
            </Link>
            .
          </p>
        </div>

        <section className="mb-10">
          <h2 className="text-xl font-semibold tracking-tight">Conectar un MCP</h2>
          <p className="mt-1 text-sm text-slate-600">
            Elige un servidor del curso o ingresa una URL MCP. Se te redirigirá al
            servidor de autenticación para autorizar la conexión.
          </p>
          <div className="mt-6">
            <ConnectForm />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold tracking-tight">Tus conexiones</h2>
          {connections.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
              Aún no has conectado ningún MCP.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {connections.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {AUTH_TYPE_LABELS[c.authType]}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">
                      {c.resourceUrl}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/dashboard/connections/${c.id}`}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
                    >
                      Ver tools
                    </Link>
                    <DeleteConnectionButton id={c.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
