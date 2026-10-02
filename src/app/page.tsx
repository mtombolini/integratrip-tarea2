import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/chat");

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">IntegraTrip</span>
          <Link
            href="/api/auth/login"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20">
        <p className="text-sm font-medium uppercase tracking-widest text-slate-500">
          IIC3103 · Agente de viajes con MCP
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Planifica tus vacaciones conversando con un agente de IA.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          IntegraTrip conecta vuelos, hoteles y clima vía Model Context
          Protocol. Conecta tus servidores MCP y pídele al agente que arme tu
          viaje: busca opciones, te pide confirmación y reserva por ti.
        </p>
        <div className="mt-10">
          <Link
            href="/api/auth/login"
            className="inline-flex rounded-md bg-slate-900 px-6 py-3 text-base font-medium text-white transition hover:bg-slate-700"
          >
            Comenzar
          </Link>
        </div>

        <dl className="mt-16 grid gap-6 sm:grid-cols-3">
          {[
            {
              t: "Conexión segura",
              d: "OAuth 2.1 + PKCE. Los secretos y tokens viven solo en el servidor.",
            },
            {
              t: "Agente de viajes",
              d: "Un LLM que usa las tools de tus MCP para buscar y reservar, con confirmación previa.",
            },
            {
              t: "Historial de chats",
              d: "Retoma tus conversaciones con el mismo contexto y revisa cada tool ejecutada.",
            },
          ].map((f) => (
            <div
              key={f.t}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <dt className="font-medium">{f.t}</dt>
              <dd className="mt-2 text-sm text-slate-600">{f.d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6 text-sm text-slate-500">
          IntegraTrip · Tareas 1 y 2 IIC3103 — Taller de Integración
        </div>
      </footer>
    </main>
  );
}
