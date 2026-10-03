import { listChats, listMessages } from "@/lib/chats/repo";
import type { UiChat, UiMessage } from "@/lib/chats/types";

// Server → client props must be plain JSON (Dates become ISO strings).
const plain = <T>(v: unknown): T => JSON.parse(JSON.stringify(v));

export async function loadChats(userId: string): Promise<UiChat[]> {
  const chats = await listChats(userId);
  return plain(
    chats.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })),
  );
}

export async function loadMessages(chatId: string): Promise<UiMessage[]> {
  return plain(await listMessages(chatId));
}
