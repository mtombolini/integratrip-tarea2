import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { listChats } from "@/lib/chats/repo";

/** The current user's conversations, most recent first. */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const chats = await listChats(session.uid);
  return NextResponse.json({
    chats: chats.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })),
  });
}
