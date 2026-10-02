import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { deleteChat, getChat, listMessages } from "@/lib/chats/repo";

/** Full stored history of one of the user's chats. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const chat = await getChat(session.uid, id);
  if (!chat) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const messages = await listMessages(chat.id);
  return NextResponse.json({ chat, messages });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await deleteChat(session.uid, id);
  return NextResponse.json({ ok: true });
}
