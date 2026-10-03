import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getConnection } from "@/lib/connections/repo";
import { AUTH_TYPE_LABELS } from "@/config/mcp-servers";
import { ToolsPanel } from "@/components/ToolsPanel";

export default async function ConnectionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { id } = await props.params;
  const conn = await getConnection(session.uid, id);
  if (!conn) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 underline-offset-2 hover:underline"
      >
        ← Configuración
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{conn.name}</h1>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {AUTH_TYPE_LABELS[conn.authType]}
        </span>
      </div>
      <p className="mt-1 break-all font-mono text-xs text-slate-500">
        {conn.resourceUrl}
      </p>

      <div className="mt-8">
        <ToolsPanel connectionId={conn.id} />
      </div>
    </div>
  );
}
