"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { layoutForFormation, resolveSlotPlayer } from "@/lib/formations";
import { DrawingThumbnail } from "@/components/TacticsBoard";
import {
  Absence,
  Line,
  Match,
  MatchPreparation,
  Player,
  SET_PIECE_CATEGORIES,
  SET_PIECE_CATEGORY_LABELS,
  SET_PIECE_SIDES,
  SET_PIECE_SIDE_LABELS,
  SetPiece,
  TacticalMoment,
  TacticalMomentNotes,
} from "@/lib/types";

const TEAM_MOMENTS: { key: TacticalMoment; label: string; icon: string }[] = [
  { key: "attacking", label: "Aanvallen", icon: "⚔️" },
  { key: "defending", label: "Verdedigen", icon: "🛡️" },
  { key: "transition_to_attack", label: "Omschakelen naar aanval", icon: "⏩" },
  { key: "transition_to_defense", label: "Omschakelen naar verdedigen", icon: "⏪" },
];

// Geen omschakelmomenten op linie-niveau, zie ook de wedstrijdvoorbereiding-editor.
const LINE_MOMENTS: { key: TacticalMoment; label: string; icon: string }[] = [
  { key: "attacking", label: "Aanvallen", icon: "⚔️" },
  { key: "defending", label: "Verdedigen", icon: "🛡️" },
];

const LINES: { key: Line; label: string }[] = [
  { key: "verdediging", label: "Verdediging" },
  { key: "middenveld", label: "Middenveld" },
  { key: "aanval", label: "Aanval" },
];

function filledMoments(
  m: TacticalMomentNotes | undefined,
  moments: { key: TacticalMoment; label: string; icon: string }[]
) {
  if (!m) return [];
  return moments.filter((mo) => m[mo.key]?.trim());
}

export default function PrintPreparationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [match, setMatch] = useState<Match | null>(null);
  const [prep, setPrep] = useState<MatchPreparation | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [setPieces, setSetPieces] = useState<SetPiece[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.list("matches"),
      api.list("match_preparations"),
      api.list("players"),
      api.list("absences"),
      api.list("set_pieces"),
    ])
      .then(([matches, preps, p, abs, sp]) => {
        setMatch(matches.find((m) => m.id === id) ?? null);
        setPrep(preps.find((pr) => pr.match_id === id) ?? null);
        setPlayers(p);
        setAbsences(abs);
        setSetPieces(sp);
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

  const teamMoments = filledMoments(prep?.tactical_notes?.team, TEAM_MOMENTS);
  const drawings = prep?.drawings ?? {};
  const chosenSetPieces = setPieces.filter((sp) => prep?.set_piece_ids?.includes(sp.id));
  const absentPlayerIds = new Set(
    absences.filter((a) => a.player_id && match.date >= a.from && match.date <= a.until).map((a) => a.player_id as string)
  );
  const absentInLineup = Object.entries(slotMap)
    .filter(([, pid]) => !pid.startsWith("guest:") && absentPlayerIds.has(pid))
    .map(([, pid]) => players.find((p) => p.id === pid)?.name)
    .filter(Boolean) as string[];

  const isAway = match.home_away === "away";
  const lineTactics = LINES.map((line) => ({
    line,
    moments: filledMoments(prep?.tactical_notes?.line?.[line.key], LINE_MOMENTS),
    drawing: drawings[`line:${line.key}`],
  })).filter((l) => l.moments.length > 0 || (l.drawing && l.drawing.length > 0));

  return (
    <div className="mx-auto max-w-3xl p-6 print:max-w-none print:p-0">
      {/* A3 liggend i.p.v. het printerstandaard-formaat: genoeg ruimte voor een
          posterachtige, op afstand leesbare opzet (grote kop, grote opstelling,
          tactiek als korte regels) in plaats van een dicht dataoverzicht. */}
      <style>{`
        @page {
          size: A3 landscape;
          margin: 8mm;
        }
      `}</style>

      <div className="no-print mb-4 flex justify-end">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          🖨️ Print / opslaan als PDF
        </button>
      </div>

      {/* Kop: groot en in clubkleuren, in één oogopslag leesbaar vanaf een paar meter. */}
      <div className="print-color-exact mb-5 rounded-2xl bg-rose-600 px-6 py-4 text-white print:mb-4 print:rounded-none print:px-5 print:py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-3xl font-extrabold leading-tight print:text-4xl">
            {isAway ? `${match.opponent} — Sv Steenwijkerwold` : `Sv Steenwijkerwold — ${match.opponent}`}
          </h1>
          <Badge>{isAway ? "UITWEDSTRIJD" : "THUISWEDSTRIJD"}</Badge>
        </div>
        <p className="mt-1 text-base font-medium text-rose-50 print:text-lg">
          {formatDate(match.date)} · aftrap {match.kickoff_time}
          {match.competition ? ` · ${match.competition}` : ""}
        </p>
      </div>

      {!prep ? (
        <p className="text-slate-500">Nog geen voorbereiding ingevuld voor deze wedstrijd.</p>
      ) : (
        <div className="print:grid print:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] print:gap-6 print:items-start">
          {/* Linkerkolom: de opstelling, groot en centraal. */}
          <div>
            {slots.length > 0 && (
              <div className="mb-6 break-inside-avoid print:mb-0">
                {prep.formation && (
                  <p className="mb-2 text-center text-lg font-bold text-slate-800 print:text-xl">{prep.formation}</p>
                )}
                <div
                  className="print-color-exact relative mx-auto w-full max-w-md overflow-hidden rounded-xl border-2 border-white/80 print:max-w-[380px]"
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
                          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold text-white print:h-12 print:w-12 print:text-lg ${
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
                        <span className="max-w-[80px] truncate rounded bg-black/50 px-1 text-[10px] leading-tight text-white print:max-w-[100px] print:text-xs">
                          {player?.name.split(" ")[0] ?? ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {Object.keys(guestNames).length > 0 && (
                  <p className="mt-2 text-center text-xs text-purple-700 print:text-sm">
                    G = gastspeler: {Object.values(guestNames).join(", ")}
                  </p>
                )}
                {absentInLineup.length > 0 && (
                  <p className="print-color-exact mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700 print:mt-2 print:px-3 print:py-2 print:text-sm">
                    ⚠️ {absentInLineup.join(", ")} {absentInLineup.length === 1 ? "staat" : "staan"} in de opstelling maar {absentInLineup.length === 1 ? "is" : "zijn"} afwezig gemeld!
                  </p>
                )}
                {substituteNames.length > 0 && (
                  <div className="mt-4 text-center print:mt-3">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500 print:text-sm">Wissels</span>
                    <p className="text-sm font-medium text-slate-800 print:text-base">{substituteNames.join(" · ")}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rechterkolom: tactiek als korte, grote regels + standaardsituaties compact. */}
          <div>
            {teamMoments.length > 0 && (
              <div className="mb-4 break-inside-avoid print:mb-4">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-rose-700 print:text-base">Team-tactiek</h2>
                <div className="grid gap-2 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
                  {teamMoments.map((m) => (
                    <div key={m.key} className="rounded-lg border border-slate-200 px-3 py-2 print:border-slate-300">
                      <div className="text-xs font-semibold text-slate-500 print:text-sm">
                        {m.icon} {m.label}
                      </div>
                      <div className="text-sm font-medium text-slate-900 print:text-base">{prep.tactical_notes!.team[m.key]}</div>
                    </div>
                  ))}
                </div>
                {drawings["team"]?.length > 0 && (
                  <div className="mt-2 print:mt-2">
                    <DrawingThumbnail strokes={drawings["team"]} className="w-full max-w-[220px] rounded-lg border border-slate-200 print:max-w-[190px]" />
                  </div>
                )}
              </div>
            )}

            {lineTactics.length > 0 && (
              <div className="mb-4 break-inside-avoid print:mb-4">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-rose-700 print:text-base">Tactiek per linie</h2>
                <div className="flex flex-col gap-2">
                  {lineTactics.map(({ line, moments, drawing }) => (
                    <div key={line.key} className="rounded-lg border border-slate-200 px-3 py-2 print:border-slate-300">
                      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500 print:text-sm">{line.label}</div>
                      <div className="grid gap-1.5 sm:grid-cols-2 print:grid-cols-2">
                        {moments.map((m) => (
                          <div key={m.key}>
                            <span className="text-xs font-semibold text-slate-500 print:text-sm">{m.icon} {m.label}: </span>
                            <span className="text-sm font-medium text-slate-900 print:text-base">
                              {prep.tactical_notes!.line[line.key][m.key]}
                            </span>
                          </div>
                        ))}
                      </div>
                      {drawing && drawing.length > 0 && (
                        <div className="mt-1.5">
                          <DrawingThumbnail strokes={drawing} className="w-full max-w-[180px] rounded-lg border border-slate-200 print:max-w-[150px]" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {chosenSetPieces.length > 0 && (
              <div className="break-inside-avoid">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-rose-700 print:text-base">Standaardsituaties</h2>
                <div className="flex flex-col gap-3">
                  {SET_PIECE_CATEGORIES.map((cat) => {
                    const inCategory = chosenSetPieces.filter((sp) => sp.category === cat);
                    if (inCategory.length === 0) return null;
                    return (
                      <div key={cat}>
                        <h3 className="mb-1 text-xs font-bold text-slate-600 print:text-sm">{SET_PIECE_CATEGORY_LABELS[cat]}</h3>
                        <div className="grid gap-2 sm:grid-cols-2 print:grid-cols-2">
                          {SET_PIECE_SIDES.map((side) => {
                            const items = inCategory.filter((sp) => sp.side === side);
                            if (items.length === 0) return null;
                            return (
                              <div key={side}>
                                <span className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-500 print:text-xs">
                                  {SET_PIECE_SIDE_LABELS[side]}
                                </span>
                                <div className="flex flex-col gap-1.5">
                                  {items.map((sp) => (
                                    <div key={sp.id} className="flex items-center gap-2">
                                      {sp.drawing.length > 0 && (
                                        <DrawingThumbnail strokes={sp.drawing} className="h-12 w-8 shrink-0 rounded border border-slate-200 print:h-14 print:w-9" />
                                      )}
                                      <div className="text-sm font-semibold text-slate-900 print:text-base">{sp.title}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold tracking-wide print:text-sm">{children}</span>
  );
}
