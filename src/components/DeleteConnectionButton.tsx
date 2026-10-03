"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteConnectionButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (
      !confirm("¿Desconectar este servidor? El agente dejará de ver sus tools.")
    )
      return;
    setLoading(true);
    try {
      await fetch(`/api/connections/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={loading}
      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
    >
      {loading ? "…" : "Desconectar"}
    </button>
  );
}
