import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

const NAV = [
  { key: "chat", href: "/chat", label: "Chat" },
  { key: "settings", href: "/dashboard", label: "Configuración" },
] as const;

export function AppHeader({
  email,
  active,
  wide = false,
}: {
  email: string;
  active: (typeof NAV)[number]["key"];
  wide?: boolean;
}) {
  return (
    <header className="shrink-0 border-b border-slate-200 bg-white">
      <div
        className={`mx-auto flex items-center justify-between gap-4 px-6 py-3 ${
          wide ? "max-w-none" : "max-w-5xl"
        }`}
      >
        <div className="flex items-center gap-6">
          <Link href="/chat" className="text-lg font-semibold tracking-tight">
            IntegraTrip
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  active === n.key
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-slate-600 sm:inline">{email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
