import { and, asc, desc, eq, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type {
  Chat,
  ChatMessage,
  StoredFunctionCall,
  StoredFunctionResult,
  ToolInvocation,
} from "@/lib/db/schema";

// Every query is scoped by userId (directly or through an owned chat), so a
// user can only read or write their own conversations.

export async function listChats(userId: string): Promise<Chat[]> {
  return db()
    .select()
    .from(schema.chats)
    .where(eq(schema.chats.userId, userId))
    .orderBy(desc(schema.chats.updatedAt));
}

export async function getChat(
  userId: string,
  chatId: string,
): Promise<Chat | undefined> {
  const [chat] = await db()
    .select()
    .from(schema.chats)
    .where(and(eq(schema.chats.id, chatId), eq(schema.chats.userId, userId)));
  return chat;
}

export async function createChat(userId: string, title: string): Promise<Chat> {
  const [chat] = await db()
    .insert(schema.chats)
    .values({ userId, title })
    .returning();
  return chat;
}

export async function deleteChat(userId: string, chatId: string) {
  await db()
    .delete(schema.chats)
    .where(and(eq(schema.chats.id, chatId), eq(schema.chats.userId, userId)));
}

export async function touchChat(chatId: string) {
  await db()
    .update(schema.chats)
    .set({ updatedAt: new Date() })
    .where(eq(schema.chats.id, chatId));
}

/** Messages of a chat in conversation order. Caller must own the chat. */
export async function listMessages(chatId: string): Promise<ChatMessage[]> {
  return db()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.chatId, chatId))
    .orderBy(asc(schema.chatMessages.seq));
}

export async function listInvocations(chatId: string): Promise<ToolInvocation[]> {
  return db()
    .select()
    .from(schema.toolInvocations)
    .where(eq(schema.toolInvocations.chatId, chatId))
    .orderBy(asc(schema.toolInvocations.createdAt));
}

export async function nextSeq(chatId: string): Promise<number> {
  const [row] = await db()
    .select({ value: max(schema.chatMessages.seq) })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.chatId, chatId));
  return (row?.value ?? -1) + 1;
}

export type NewMessage = {
  chatId: string;
  seq: number;
  role: ChatMessage["role"];
  text?: string | null;
  functionCalls?: StoredFunctionCall[] | null;
  functionResults?: StoredFunctionResult[] | null;
  meta?: Record<string, unknown> | null;
};

export async function appendMessage(input: NewMessage): Promise<ChatMessage> {
  const [msg] = await db()
    .insert(schema.chatMessages)
    .values({
      chatId: input.chatId,
      seq: input.seq,
      role: input.role,
      text: input.text ?? null,
      functionCalls: input.functionCalls ?? null,
      functionResults: input.functionResults ?? null,
      meta: input.meta ?? null,
    })
    .returning();
  return msg;
}

export type NewInvocation = Omit<ToolInvocation, "id" | "createdAt">;

export async function recordInvocations(rows: NewInvocation[]) {
  if (rows.length === 0) return;
  await db().insert(schema.toolInvocations).values(rows);
}
