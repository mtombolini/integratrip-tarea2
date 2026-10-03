import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ChatsProvider } from "@/components/app/ChatsContext";
import { Sidebar } from "@/components/app/Sidebar";
import { loadChats } from "./chat/data";

/** Shell for every logged-in view: sidebar (Chat / Configuración / chats) + content. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  const chats = await loadChats(session.uid);

  return (
    <ChatsProvider initial={chats}>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar email={session.email} />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto pt-12 md:pt-0">
          {children}
        </main>
      </div>
    </ChatsProvider>
  );
}
