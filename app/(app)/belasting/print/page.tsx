"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Player, TEAM_NAME } from "@/lib/types";

const JERSEY_STRIPE = {
  backgroundImage:
    "linear-gradient(45deg, #e11d48 0%, #e11d48 29%, #000 29%, #000 43%, #e11d48 43%, #e11d48 53%, #000 53%, #000 67%, #e11d48 67%, #e11d48 100%)",
};

function Checkbox({ label }: { label: string }) {
  return (
    <span className="mr-4 inline-flex items-center gap-1.5">
      <span className="inline-block h-4 w-4 rounded border-2 border-slate-700 align-middle" />
      <span>{label}</span>
    </span>
  );
}

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
    <div className="mx-auto max-w-4xl p-6 print:max-w-none print:p-0">
      {/* A4 rechtop, alles op 1 pagina — dus compactere marges/regelhoogtes dan het
          A3-liggende printvel van de wedstrijdvoorbereiding. */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/belasting" className="text-sm text-rose-600 hover:underline">← Terug naar Belasting</Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          🖨️ Print / opslaan als PDF
        </button>
      </div>

      <div className="print-color-exact overflow-hidden rounded-xl border border-slate-200 print:rounded-none print:border-0">
        <div className="h-2.5" style={JERSEY_STRIPE} />
        <div className="flex items-center justify-between gap-4 bg-black px-5 py-4 text-white print:px-3 print:py-2">
          <div>
            <h1 className="text-xl font-bold leading-tight print:text-base">{TEAM_NAME}</h1>
            <p className="text-sm text-neutral-300 print:text-xs">Belasting-invulformulier</p>
          </div>
          <span className="text-3xl print:text-xl" aria-hidden>⚽</span>
        </div>

        <div className="px-5 py-4 print:px-3 print:py-2">
          <p className="mb-4 text-xs text-slate-500 print:mb-2 print:text-[11px]">
            Na elke training of wedstrijd door alle spelers samen op één lijst in te vullen. De staf verwerkt de
            ingevulde gegevens daarna in de app (Belasting → Sessie invoeren).
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm print-color-exact print:mb-2 print:gap-y-1 print:px-3 print:py-1.5 print:text-xs">
            <span>
              <span className="mr-2 font-medium text-slate-700">Datum</span>
              <span className="inline-block w-40 border-b-2 border-slate-400">&nbsp;</span>
            </span>
            <span className="flex items-center">
              <span className="mr-2 font-medium text-slate-700">Type</span>
              <Checkbox label="Training" />
              <Checkbox label="Wedstrijd" />
            </span>
            <span>
              <span className="mr-2 font-medium text-slate-700">Tegenstander (indien wedstrijd)</span>
              <span className="inline-block w-40 border-b-2 border-slate-400">&nbsp;</span>
            </span>
          </div>

          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-rose-50 px-4 py-2.5 text-xs text-rose-900 print-color-exact print:mb-2 print:px-3 print:py-1 print:text-[11px]">
            <span><span className="font-semibold">RPE</span> (ervaren zwaarte): 1 = heel licht · 10 = maximaal</span>
            <span><span className="font-semibold">Vermoeidheid</span> na training: 1 = heel licht · 10 = maximaal</span>
          </div>

          <table className="w-full border-collapse text-sm print:text-xs">
            <thead>
              <tr className="print-color-exact bg-black text-white">
                <th className="border border-black px-2 py-2 text-left font-semibold print:py-1">Speler</th>
                <th className="border border-black px-2 py-2 font-semibold print:py-1">RPE (1-10)</th>
                <th className="border border-black px-2 py-2 font-semibold print:py-1">Vermoeidheid (1-10)</th>
                <th className="border border-black px-2 py-2 font-semibold print:py-1">Blessure (ja/nee + toelichting)</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr
                  key={p.id}
                  className={`break-inside-avoid print-color-exact ${i % 2 === 1 ? "bg-rose-50/60" : "bg-white"}`}
                >
                  <td className="border border-slate-300 px-2 py-3 font-medium print:py-1.5">{p.name}</td>
                  <td className="border border-slate-300 px-2 py-3 print:py-1.5"></td>
                  <td className="border border-slate-300 px-2 py-3 print:py-1.5"></td>
                  <td className="border border-slate-300 px-2 py-3 print:py-1.5"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="h-2.5" style={JERSEY_STRIPE} />
      </div>
    </div>
  );
}
