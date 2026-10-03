import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Liveness probe for the deployment platform. No secrets. With `?db=1` it
 * also runs a trivial query: the scheduled keepalive workflow uses it so the
 * free Supabase project is never paused for inactivity.
 */
export async function GET(req: Request) {
  const body = { status: "ok", service: "integratrip" };
  if (new URL(req.url).searchParams.get("db") !== "1") {
    return NextResponse.json(body);
  }
  try {
    await db().execute(sql`select 1`);
    return NextResponse.json({ ...body, db: "ok" });
  } catch {
    return NextResponse.json(
      { ...body, status: "degraded", db: "error" },
      { status: 503 },
    );
  }
}
