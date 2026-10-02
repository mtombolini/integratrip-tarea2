import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { buildCatalog } from "@/lib/agent/catalog";

/** Tools available to the agent across the user's connected MCPs. */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const catalog = await buildCatalog(session.uid);
  return NextResponse.json({
    tools: catalog.entries.map((e) => ({
      name: e.exposedName,
      toolName: e.toolName,
      description: e.description,
      inputSchema: e.inputSchema,
      serverName: e.serverName,
      authType: e.authType,
    })),
    warnings: catalog.warnings,
  });
}
