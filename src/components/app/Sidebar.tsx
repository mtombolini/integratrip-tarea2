"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useChats } from "./ChatsContext";

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="h-4 w-4"
    >
      <path
        d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 16 14H8l-4 3v-3a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="h-4 w-4"
    >
      <circle cx="10" cy="10" r="2.5" />
      <path
        d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  );
}

function SidebarContent({
  email,
  onNavigate,
}: {
  email: string;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { chats, removeChat, requestNewChat } = useChats();
  const activeChatId = pathname.startsWith("/chat/")
    ? pathname.split("/")[2]
    : null;
  const inChat = pathname === "/chat" || pathname.startsWith("/chat/");
  const inSettings = pathname.startsWith("/dashboard");

  function newChat() {
    requestNewChat();
    router.push("/chat");
    onNavigate();
  }

  async function deleteChat(id: string) {
    if (!confirm("¿Eliminar esta conversación?")) return;
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    removeChat(id);
    if (id === activeChatId) newChat();
  }

  const navItem = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
      active
        ? "bg-white/10 text-white"
        : "text-slate-300 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <div className="flex h-full w-72 flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-bold text-white">
          IT
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight">IntegraTrip</p>
          <p className="text-[11px] leading-tight text-slate-400">
            Agente de viajes
          </p>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={newChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
        >
          <PlusIcon /> Nueva conversación
        </button>
      </div>

      <nav className="mt-4 space-y-1 px-3">
        <Link href="/chat" onClick={onNavigate} className={navItem(inChat)}>
          <ChatIcon /> Chat
        </Link>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={navItem(inSettings)}
        >
          <GearIcon /> Configuración
        </Link>
      </nav>

      <p className="mt-6 px-5 pb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        Conversaciones
      </p>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {chats.length === 0 && (
          <li className="px-3 py-2 text-xs text-slate-500">
            Aún no hay conversaciones.
          </li>
        )}
        {chats.map((c) => (
          <li key={c.id} className="group relative">
            <Link
              href={`/chat/${c.id}`}
              onClick={onNavigate}
              title={c.title}
              className={`block truncate rounded-lg py-2 pl-3 pr-8 text-sm transition ${
                c.id === activeChatId
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {c.title}
            </Link>
            <button
              onClick={() => deleteChat(c.id)}
              title="Eliminar conversación"
              className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-white/10 hover:text-red-300 group-hover:block"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold uppercase">
            {email[0]}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
            {email}
          </span>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              title="Cerrar sesión"
              className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Persistent app navigation: fixed on desktop, drawer on mobile. */
export function Sidebar({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="hidden shrink-0 md:flex">
        <SidebarContent email={email} onNavigate={() => {}} />
      </aside>

      <div className="fixed inset-x-0 top-0 z-20 flex h-12 items-center gap-3 border-b border-slate-200 bg-white px-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md px-2 py-1 text-lg text-slate-700 hover:bg-slate-100"
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <span className="text-sm font-semibold">IntegraTrip</span>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <SidebarContent email={email} onNavigate={() => setOpen(false)} />
          <button
            className="flex-1 bg-black/40"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
