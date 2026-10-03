"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { UiChat } from "@/lib/chats/types";

// Conversation list shared by the app sidebar and the chat view, so a chat
// created or deleted in one place shows up in the other without a reload.

type ChatsState = {
  chats: UiChat[];
  upsertChat: (chat: { id: string; title: string }) => void;
  removeChat: (id: string) => void;
  /** Bumped when the user asks for a new conversation. */
  newChatSignal: number;
  requestNewChat: () => void;
};

const Ctx = createContext<ChatsState | null>(null);

export function ChatsProvider({
  initial,
  children,
}: {
  initial: UiChat[];
  children: React.ReactNode;
}) {
  const [chats, setChats] = useState(initial);
  const [newChatSignal, setSignal] = useState(0);

  const upsertChat = useCallback((chat: { id: string; title: string }) => {
    const updatedAt = new Date().toISOString();
    setChats((cs) => [
      { ...chat, updatedAt },
      ...cs.filter((c) => c.id !== chat.id),
    ]);
  }, []);

  const removeChat = useCallback((id: string) => {
    setChats((cs) => cs.filter((c) => c.id !== id));
  }, []);

  const requestNewChat = useCallback(() => setSignal((n) => n + 1), []);

  const value = useMemo(
    () => ({ chats, upsertChat, removeChat, newChatSignal, requestNewChat }),
    [chats, upsertChat, removeChat, newChatSignal, requestNewChat],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChats(): ChatsState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChats must be used inside ChatsProvider");
  return v;
}
