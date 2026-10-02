import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AppHeader } from "@/components/AppHeader";
import { ChatView } from "@/components/chat/ChatView";
import { loadChats } from "./data";

/** New conversation: empty context. */
export default async function NewChatPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const chats = await loadChats(session.uid);

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader email={session.email} active="chat" wide />
      <ChatView key="new" chats={chats} chatId={null} messages={[]} />
    </div>
  );
}
