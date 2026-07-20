"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { layoutForFormation, resolveSlotPlayer } from "@/lib/formations";
import { DrawingThumbnail } from "@/components/TacticsBoard";
import { Absence, Line, Match, MatchPreparation, Player, TacticalMoment, TacticalMomentNotes } from "@/lib/types";

const TACTICAL_MOMENTS: { key: TacticalMoment; label: string }[] = [
  { key: "attacking", label: "Aanvallen" },
  { key: "defending", label: "Verdedigen" },
  { key: "transition_to_attack", label: "Omschakelen naar aanval" },
  { key: "transition_to_defense", label: "Omschakelen naar verdedigen" },
];

const LINES: { key: Line; label: string }[] = [
  { key: "verdediging", label: "Verdediging" },
  { key: "middenveld", label: "Middenveld" },
  { key: "aanval", label: "Aanval" },
];

function filledMoments(m: TacticalMomentNotes | undefined) {
  if (!m) return [];
  return TACTICAL_MOMENTS.filter((mo) => m[mo.key]?.trim());
}

export default function PrintPreparationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [match, setMatch] = useState<Match | null>(null);
  const [prep, setPrep] = useState<MatchPreparation | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.list("matches"), api.list("match_preparations"), api.list("players"), api.list("absences")])
      .then(([matches, preps, p, abs]) => {
        setMatch(matches.find((m) => m.id === id) ?? null);
        setPrep(preps.find((pr) => pr.match_id === id) ?? null);
        setPlayers(p);
        setAbsences(abs);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="p-8 text-slate-500">Laden…</p>;
  if (!match) return <p className="p-8 text-slate-500">Wedstrijd niet gevonden.</p>;

  const slots = layoutForFormation(prep?.formation ?? "");
  const guestNames: Record<string, string> = {};
  const slotMap: Record<string, string> = {};
  (prep?.lineup ?? []).forEach((entry) => {
    if (entry.guest_name) {
      guestNames[entry.slot] = entry.guest_name;
      slotMap[entry.slot] = `guest:${entry.slot}`;
    } else if (entry.player_id) {
      slotMap[entry.slot] = entry.player_id;
    }
  });

  const substituteNames = (prep?.substitutes ?? [])
    .map((pid) => players.find((p) => p.id === pid)?.name)
    .filter(Boolean) as string[];

  const teamMoments = filledMoments(prep?.tactical_notes?.team);
  const drawings = prep?.drawings ?? {};
  const absentPlayerIds = new Set(
    absences.filter((a) => a.player_id && match.date >= a.from && match.date <= a.until).map((a) => a.player_id as string)
  );
  const absentInLineup = Object.entries(slotMap)
    .filter(([, pid]) => !pid.startsWith("guest:") && absentPlayerIds.has(pid))
    .map(([, pid]) => players.find((p) => p.id === pid)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="no-print mb-4 flex justify-end">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          🖨️ Print / opslaan als PDF
        </button>
      </div>

      <h1 className="text-2xl font-bold">
        {match.home_away === "away" ? `${match.opponent} — Sv Steenwijkerwold` : `Sv Steenwijkerwold — ${match.opponent}`}
      </h1>
      <p className="mb-6 text-sm text-slate-600">
        {formatDate(match.date)} · aftrap {match.kickoff_time} · {match.home_away === "home" ? "Thuiswedstrijd" : "Uitwedstrijd"}
        {match.competition ? ` · ${match.competition}` : ""}
      </p>

      {!prep ? (
        <p className="text-slate-500">Nog geen voorbereiding ingevuld voor deze wedstrijd.</p>
      ) : (
        <>
          {slots.length > 0 && (
            <div className="mb-6 break-inside-avoid">
              {prep.formation && <p className="mb-2 text-sm font-medium text-slate-700">Formatie: {prep.formation}</p>}
              <div
                className="print-color-exact relative mx-auto w-full max-w-md overflow-hidden rounded-xl border-2 border-white/80"
                style={{ aspectRatio: "2 / 3", background: "linear-gradient(180deg, #16a34a, #15803d)" }}
              >
                <div className="absolute left-0 right-0 top-1/2 h-px bg-white/50" />
                <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />

                {slots.map((slot) => {
                  const player = resolveSlotPlayer(slotMap[slot.id], guestNames, players);
                  const pid = slotMap[slot.id];
                  const isAbsent = !!pid && !pid.startsWith("guest:") && absentPlayerIds.has(pid);
                  return (
                    <div
                      key={slot.id}
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold text-white ${
                          isAbsent
                            ? "border-red-400 bg-red-600"
                            : player
                              ? player.isGuest
                                ? "border-white bg-purple-700"
                                : "border-white bg-slate-900"
                              : "border-dashed border-white/70"
                        }`}
                      >
                        {isAbsent ? "🚫" : player ? (player.isGuest ? "G" : (player.shirtNumber ?? "•")) : slot.label}
                      </span>
                      <span className="max-w-[70px] truncate rounded bg-black/50 px-1 text-[10px] leading-tight text-white">
                        {player?.name.split(" ")[0] ?? ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              {Object.keys(guestNames).length > 0 && (
                <p className="mt-2 text-xs text-purple-700">
                  G = gastspeler: {Object.values(guestNames).join(", ")}
                </p>
              )}
              {absentInLineup.length > 0 && (
                <p className="print-color-exact mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  ⚠️ Let op: {absentInLineup.join(", ")} {absentInLineup.length === 1 ? "staat" : "staan"} in de opstelling maar {absentInLineup.length === 1 ? "is" : "zijn"} afwezig gemeld op deze datum.
                </p>
              )}
            </div>
          )}

          {substituteNames.length > 0 && (
            <div className="mb-6 break-inside-avoid">
              <h2 className="mb-1 font-semibold">Wisselspelers</h2>
              <p className="text-sm text-slate-700">{substituteNames.join(", ")}</p>
            </div>
          )}

          {teamMoments.length > 0 && (
            <div className="mb-6 break-inside-avoid">
              <h2 className="mb-2 font-semibold">Tactiek — team-niveau</h2>
              <dl className="grid gap-2 sm:grid-cols-2">
                {teamMoments.map((m) => (
                  <div key={m.key}>
                    <dt className="text-xs font-medium text-slate-500">{m.label}</dt>
                    <dd className="text-sm text-slate-800">{prep.tactical_notes!.team[m.key]}</dd>
                  </div>
                ))}
              </dl>
              {drawings["team"]?.length > 0 && (
                <div className="mt-2">
                  <DrawingThumbnail strokes={drawings["team"]} />
                </div>
              )}
            </div>
          )}

          {LINES.map((line) => {
            const moments = filledMoments(prep.tactical_notes?.line?.[line.key]);
            const lineDrawing = drawings[`line:${line.key}`];
            if (moments.length === 0 && (!lineDrawing || lineDrawing.length === 0)) return null;
            return (
              <div key={line.key} className="mb-6 break-inside-avoid">
                <h2 className="mb-2 font-semibold">Tactiek — {line.label}</h2>
                {moments.length > 0 && (
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {moments.map((m) => (
                      <div key={m.key}>
                        <dt className="text-xs font-medium text-slate-500">{m.label}</dt>
                        <dd className="text-sm text-slate-800">{prep.tactical_notes!.line[line.key][m.key]}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {lineDrawing && lineDrawing.length > 0 && (
                  <div className="mt-2">
                    <DrawingThumbnail strokes={lineDrawing} />
                  </div>
                )}
              </div>
            );
          })}

          {(prep.corners_notes || prep.freekicks_notes || prep.throwins_notes) && (
            <div className="mb-6 break-inside-avoid">
              <h2 className="mb-2 font-semibold">Standaardsituaties</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Corners", notes: prep.corners_notes, key: "corners" },
                  { label: "Vrije trappen", notes: prep.freekicks_notes, key: "freekicks" },
                  { label: "Ingooien", notes: prep.throwins_notes, key: "throwins" },
                ]
                  .filter((s) => s.notes || drawings[s.key]?.length > 0)
                  .map((s) => (
                    <div key={s.key}>
                      <h3 className="mb-1 text-sm font-medium text-slate-700">{s.label}</h3>
                      {s.notes && <p className="text-sm text-slate-800">{s.notes}</p>}
                      {drawings[s.key]?.length > 0 && (
                        <div className="mt-2">
                          <DrawingThumbnail strokes={drawings[s.key]} />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
