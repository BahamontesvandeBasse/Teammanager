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

// Zelfde groepering als in de wedstrijdvoorbereiding-editor: elke groep hoort bij
// precies één tekening (drawings["team:attack"] / drawings["team:defend"]).
const TEAM_MOMENT_GROUPS: {
  key: "attack" | "defend";
  title: string;
  moments: { key: TacticalMoment; label: string; icon: string }[];
}[] = [
  {
    key: "attack",
    title: "In balbezit",
    moments: [
      { key: "attacking", label: "Aanvallen", icon: "⚔️" },
      { key: "transition_to_defense", label: "Omschakelen naar verdedigen", icon: "⏪" },
    ],
  },
  {
    key: "defend",
    title: "Niet in balbezit",
    moments: [
      { key: "defending", label: "Verdedigen", icon: "🛡️" },
      { key: "transition_to_attack", label: "Omschakelen naar aanval", icon: "⏩" },
    ],
  },
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

  const drawings = prep?.drawings ?? {};
  const teamTactics = TEAM_MOMENT_GROUPS.map((group) => ({
    group,
    moments: filledMoments(prep?.tactical_notes?.team, group.moments),
    drawing: drawings[`team:${group.key}`],
  }));
  const chosenSetPieces = setPieces.filter((sp) => prep?.set_piece_ids?.includes(sp.id));
  const absentPlayerIds = new Set(
    absences.filter((a) => a.player_id && match.date >= a.from && match.date <= a.until).map((a) => a.player_id as string)
  );
  const absentInLineup = Object.entries(slotMap)
    .filter(([, pid]) => !pid.startsWith("guest:") && absentPlayerIds.has(pid))
    .map(([, pid]) => players.find((p) => p.id === pid)?.name)
    .filter(Boolean) as string[];

  const isAway = match.home_away === "away";
  // Altijd alle 3 linies tonen (ook leeg) zodat pagina 2 een vast 2x2-kwadrantenraster blijft.
  const lineTactics = LINES.map((line) => ({
    line,
    moments: filledMoments(prep?.tactical_notes?.line?.[line.key], LINE_MOMENTS),
    drawing: drawings[`line:${line.key}`],
  }));

  const matchLabel = isAway ? `${match.opponent} — Sv Steenwijkerwold` : `Sv Steenwijkerwold — ${match.opponent}`;

  return (
    <div className="mx-auto max-w-3xl p-6 print:max-w-none print:p-0">
      {/* A3 liggend, twee pagina's: 1) grote opstelling + team-tactiek, 2) tactiek per
          linie + standaardsituaties als vast 2x2-kwadrantenraster — zo blijft de
          opstelling op pagina 1 groot genoeg om vanaf een paar meter te lezen. */}
      <style>{`
        @page {
          size: A3 landscape;
          margin: 8mm;
        }
        @media print {
          .page-break {
            break-before: page;
          }
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
          <h1 className="text-3xl font-extrabold leading-tight print:text-4xl">{matchLabel}</h1>
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
        <>
          {/* ---------- Pagina 1: opstelling links, team-tactiek (2 tekeningen) ernaast ---------- */}
          <div className="break-inside-avoid grid grid-cols-[220px_1fr] gap-4 print:grid-cols-[260px_1fr] print:gap-6">
            {/* Links: opstelling — smaller dan voorheen zodat de team-tactiek ernaast past. */}
            <div>
              {slots.length > 0 && (
                <div>
                  {prep.formation && (
                    <p className="mb-1.5 text-center text-base font-bold text-slate-800 print:text-lg">{prep.formation}</p>
                  )}
                  <div
                    className="print-color-exact relative mx-auto w-full overflow-hidden rounded-xl border-2 border-white/80"
                    style={{ aspectRatio: "2 / 3", background: "linear-gradient(180deg, #16a34a, #15803d)" }}
                  >
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-white/50" />
                    <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />

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
                            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold text-white print:h-9 print:w-9 print:text-sm ${
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
                          <span className="max-w-[60px] truncate rounded bg-black/50 px-1 text-[8px] leading-tight text-white print:max-w-[70px] print:text-[10px]">
                            {player?.name.split(" ")[0] ?? ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {Object.keys(guestNames).length > 0 && (
                    <p className="mt-2 text-center text-[10px] text-purple-700 print:text-xs">
                      G = gastspeler: {Object.values(guestNames).join(", ")}
                    </p>
                  )}
                  {absentInLineup.length > 0 && (
                    <p className="print-color-exact mx-auto mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-center text-[10px] font-bold text-red-700 print:text-xs">
                      ⚠️ {absentInLineup.join(", ")} {absentInLineup.length === 1 ? "staat" : "staan"} in de opstelling maar {absentInLineup.length === 1 ? "is" : "zijn"} afwezig gemeld!
                    </p>
                  )}
                  {substituteNames.length > 0 && (
                    <div className="mt-2 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 print:text-xs">Wissels</span>
                      <p className="text-xs font-medium text-slate-800 print:text-sm">{substituteNames.join(" · ")}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rechts: team-tactiek — twee groepen, elk met eigen tekening. */}
            <div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-rose-700 print:text-base">
                Team-tactiek
              </h2>
              <div className="grid grid-cols-2 gap-3 print:gap-4">
                {teamTactics.map(({ group, moments, drawing }) => (
                  <div key={group.key} className="rounded-lg border border-slate-200 p-3 print:border-slate-300 print:p-3">
                    <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 print:text-sm">
                      {group.title}
                    </h3>
                    {moments.length === 0 ? (
                      <p className="text-xs text-slate-400 print:text-sm">Niet ingevuld.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {moments.map((m) => (
                          <div key={m.key}>
                            <div className="text-xs font-semibold text-slate-500 print:text-sm">
                              {m.icon} {m.label}
                            </div>
                            <div className="text-sm font-medium text-slate-900 print:text-base">
                              {prep.tactical_notes!.team[m.key]}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {drawing && drawing.length > 0 && (
                      <div className="mt-2 flex justify-center">
                        <DrawingThumbnail strokes={drawing} className="w-full max-w-[200px] rounded-lg border border-slate-200 print:max-w-[220px]" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ---------- Pagina 2: tactiek per linie + standaardsituaties, vaste 2x2-kwadranten ---------- */}
          <div className="page-break mt-8 print:mt-0">
            <p className="no-print mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Pagina 2 — {matchLabel}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:h-full print:grid-cols-2 print:grid-rows-2 print:gap-4">
              {lineTactics.map(({ line, moments, drawing }) => (
                <div key={line.key} className="flex flex-col rounded-xl border border-slate-200 p-4 print:border-slate-300 print:p-4">
                  <h2 className="mb-2 text-base font-bold uppercase tracking-wide text-rose-700 print:text-lg">{line.label}</h2>
                  {moments.length === 0 ? (
                    <p className="text-sm text-slate-400 print:text-base">Niet ingevuld.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {moments.map((m) => (
                        <div key={m.key}>
                          <div className="text-xs font-semibold text-slate-500 print:text-sm">{m.icon} {m.label}</div>
                          <div className="text-sm font-medium text-slate-900 print:text-base">
                            {prep.tactical_notes!.line[line.key][m.key]}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {drawing && drawing.length > 0 && (
                    <div className="mt-2 flex flex-1 items-end justify-center">
                      <DrawingThumbnail strokes={drawing} className="w-full max-w-[220px] rounded-lg border border-slate-200 print:max-w-[200px]" />
                    </div>
                  )}
                </div>
              ))}

              <div className="flex flex-col rounded-xl border border-slate-200 p-4 print:border-slate-300 print:p-4">
                <h2 className="mb-2 text-base font-bold uppercase tracking-wide text-rose-700 print:text-lg">Standaardsituaties</h2>
                {chosenSetPieces.length === 0 ? (
                  <p className="text-sm text-slate-400 print:text-base">Geen standaardsituaties gekozen.</p>
                ) : (
                  <div className="flex flex-col gap-2.5 overflow-y-auto">
                    {SET_PIECE_CATEGORIES.map((cat) => {
                      const inCategory = chosenSetPieces.filter((sp) => sp.category === cat);
                      if (inCategory.length === 0) return null;
                      return (
                        <div key={cat}>
                          <h3 className="mb-1 text-xs font-bold text-slate-600 print:text-sm">{SET_PIECE_CATEGORY_LABELS[cat]}</h3>
                          <div className="grid grid-cols-2 gap-2">
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
                                      <div key={sp.id} className="flex items-center gap-2.5">
                                        {sp.drawing.length > 0 && (
                                          <DrawingThumbnail strokes={sp.drawing} className="h-16 w-10 shrink-0 rounded border border-slate-200 print:h-24 print:w-16" />
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
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold tracking-wide print:text-sm">{children}</span>
  );
}
