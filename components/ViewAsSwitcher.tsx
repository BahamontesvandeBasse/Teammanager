"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Role, ROLE_LABELS } from "@/lib/auth/roles";

const IMPERSONATABLE: Role[] = ["staf", "toeschouwer", "speler"];

// Alleen zichtbaar voor de echte beheerder (ongeacht welke rol op dit moment
// wordt gesimuleerd) — laat snel wisselen tussen "bekijk als" een andere rol,
// zodat je kunt zien of iets in de rechten (API-redactie) of in de layout
// (verborgen knoppen) moet worden aangepast.
export function ViewAsSwitcher({ realRole, effectiveRole }: { realRole: Role; effectiveRole: Role }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (realRole !== "admin") return null;

  async function setView(role: Role) {
    setBusy(true);
    try {
      await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (effectiveRole !== "admin") {
    return (
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950">
        <span>
          👁️ Je bekijkt de app als <strong>{ROLE_LABELS[effectiveRole]}</strong> — zo zien zij het.
        </span>
        <button
          onClick={() => setView("admin")}
          disabled={busy}
          className="rounded-md bg-white/80 px-3 py-1 font-semibold hover:bg-white disabled:opacity-60"
        >
          Terug naar beheerder
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-neutral-100 px-4 py-1.5 text-xs text-neutral-500">
      <span>Bekijk als:</span>
      {IMPERSONATABLE.map((r) => (
        <button
          key={r}
          onClick={() => setView(r)}
          disabled={busy}
          className="rounded-md border border-neutral-300 px-2 py-0.5 hover:border-neutral-400 hover:text-neutral-800 disabled:opacity-60"
        >
          {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}
