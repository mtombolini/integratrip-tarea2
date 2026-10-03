import { ChatView } from "@/components/chat/ChatView";

/** New conversation: empty context. */
export default function NewChatPage() {
  return <ChatView key="new" chatId={null} messages={[]} />;
}
