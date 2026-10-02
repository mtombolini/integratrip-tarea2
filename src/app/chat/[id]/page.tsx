import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getChat } from "@/lib/chats/repo";
import { AppHeader } from "@/components/AppHeader";
import { ChatView } from "@/components/chat/ChatView";
import { loadChats, loadMessages } from "../data";

/** Resume an existing conversation with its full stored history. */
export default async function ChatPage(props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");

  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const chat = await getChat(session.uid, id);
  if (!chat) notFound();

  const [chats, messages] = await Promise.all([
    loadChats(session.uid),
    loadMessages(chat.id),
  ]);

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader email={session.email} active="chat" wide />
      <ChatView key={chat.id} chats={chats} chatId={chat.id} messages={messages} />
    </div>
  );
}
