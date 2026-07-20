"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Player, TEAM_NAME } from "@/lib/types";

export default function BelastingPrintPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .list("players")
      .then((p) => setPlayers([...p].filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name, "nl"))))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-8 text-slate-500">Laden…</p>;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/belasting" className="text-sm text-rose-600 hover:underline">← Terug naar Belasting</Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          🖨️ Print / opslaan als PDF
        </button>
      </div>

      <h1 className="text-xl font-bold">{TEAM_NAME} — Belasting-invulformulier</h1>
      <p className="mb-4 text-sm text-slate-600">
        Na elke training of wedstrijd door alle spelers samen op één lijst in te vullen. De staf verwerkt de ingevulde
        gegevens daarna in de app (Belasting → Sessie invoeren).
      </p>

      <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <span className="text-slate-600">Datum: </span>
          <span className="inline-block w-40 border-b border-slate-400">&nbsp;</span>
        </div>
        <div>
          <span className="text-slate-600">Type: </span>
          <span className="mr-3">☐ Training</span>
          <span>☐ Wedstrijd</span>
        </div>
        <div>
          <span className="text-slate-600">Tegenstander (indien wedstrijd): </span>
          <span className="inline-block w-32 border-b border-slate-400">&nbsp;</span>
        </div>
      </div>

      <p className="mb-2 text-xs text-slate-500">
        RPE (ervaren zwaarte) 1 = heel licht, 10 = maximaal. Vermoeidheid en spierpijn: 1 = heel slecht, 10 = heel goed/geen pijn.
      </p>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-slate-400 px-2 py-1 text-left">Speler</th>
            <th className="border border-slate-400 px-2 py-1">Afwezig</th>
            <th className="border border-slate-400 px-2 py-1">Minuten</th>
            <th className="border border-slate-400 px-2 py-1">RPE (1-10)</th>
            <th className="border border-slate-400 px-2 py-1">Vermoeidheid (1-10)</th>
            <th className="border border-slate-400 px-2 py-1">Spierpijn (1-10)</th>
            <th className="border border-slate-400 px-2 py-1">Blessure (ja/nee + toelichting)</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="break-inside-avoid">
              <td className="border border-slate-400 px-2 py-3 font-medium">{p.name}</td>
              <td className="border border-slate-400 px-2 py-3"></td>
              <td className="border border-slate-400 px-2 py-3"></td>
              <td className="border border-slate-400 px-2 py-3"></td>
              <td className="border border-slate-400 px-2 py-3"></td>
              <td className="border border-slate-400 px-2 py-3"></td>
              <td className="border border-slate-400 px-2 py-3"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
