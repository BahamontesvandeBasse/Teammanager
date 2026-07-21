"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate, formatDateShort } from "@/lib/format";
import { computeMatchTimes } from "@/lib/schedule";
import { FORMATION_PRESETS, FormationSlot, isGuestId, layoutForFormation, resolveSlotPlayer } from "@/lib/formations";
import { Badge, Button, Card, Message, PageTitle, inputCls, tdCls, thCls } from "@/components/ui";
import { DrawingThumbnail, TacticsBoardModal } from "@/components/TacticsBoard";
import {
  Absence,
  CarpoolDuty,
  Club,
  DrawingElement,
  Line,
  LoadEntry,
  Match,
  MatchPreparation,
  MatchStat,
  Player,
  SET_PIECE_CATEGORIES,
  SET_PIECE_CATEGORY_LABELS,
  SET_PIECE_SIDES,
  SET_PIECE_SIDE_LABELS,
  SetPiece,
  TacticalMoment,
  TacticalMomentNotes,
  TacticalNotes,
  VideoLink,
  WarmingUp,
  WashDuty,
  emptyTacticalNotes,
} from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

function drawingLabel(key: string): string {
  if (key === "team") return "Team-niveau";
  const line = key.split(":")[1];
  return `Linie-niveau — ${line ? line.charAt(0).toUpperCase() + line.slice(1) : line}`;
}

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

function isPlayed(m: Match): boolean {
  return m.score_for !== null && m.score_against !== null;
}

function emptyMomentNotes(): TacticalMomentNotes {
  return { attacking: "", defending: "", transition_to_attack: "", transition_to_defense: "" };
}

// Tolereert de oude platte structuur (vóór de linie-tabs bestonden er nog geen aparte
// verdediging/middenveld/aanval) door die als "verdediging" te behandelen.
function mergeTacticalNotes(notes: TacticalNotes | null | undefined): TacticalNotes {
  const empty = emptyTacticalNotes();
  const rawLine = notes?.line as unknown;

  let line = empty.line;
  if (rawLine && typeof rawLine === "object") {
    if ("verdediging" in rawLine || "middenveld" in rawLine || "aanval" in rawLine) {
      const r = rawLine as Partial<Record<Line, Partial<TacticalMomentNotes>>>;
      line = {
        verdediging: { ...empty.line.verdediging, ...(r.verdediging ?? {}) },
        middenveld: { ...empty.line.middenveld, ...(r.middenveld ?? {}) },
        aanval: { ...empty.line.aanval, ...(r.aanval ?? {}) },
      };
    } else {
      line = { ...empty.line, verdediging: { ...empty.line.verdediging, ...(rawLine as Partial<TacticalMomentNotes>) } };
    }
  }

  return { team: { ...empty.team, ...(notes?.team ?? {}) }, line };
}

function trimTacticalNotes(notes: TacticalNotes): TacticalNotes {
  const trimMoments = (m: TacticalMomentNotes): TacticalMomentNotes =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.trim()])) as TacticalMomentNotes;
  return {
    team: trimMoments(notes.team),
    line: {
      verdediging: trimMoments(notes.line.verdediging),
      middenveld: trimMoments(notes.line.middenveld),
      aanval: trimMoments(notes.line.aanval),
    },
  };
}

export default function WedstrijdenPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Laden…</p>}>
      <WedstrijdenPageInner />
    </Suspense>
  );
}

function WedstrijdenPageInner() {
  const canEdit = useCanEdit();
  const searchParams = useSearchParams();
  const preselectMatch = searchParams.get("match");

  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [preparations, setPreparations] = useState<MatchPreparation[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);
  const [loadEntries, setLoadEntries] = useState<LoadEntry[]>([]);
  const [washDuty, setWashDuty] = useState<WashDuty[]>([]);
  const [carpoolDuty, setCarpoolDuty] = useState<CarpoolDuty[]>([]);
  const [videoLinks, setVideoLinks] = useState<VideoLink[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [warmups, setWarmups] = useState<WarmingUp[]>([]);
  const [setPieces, setSetPieces] = useState<SetPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const [formation, setFormationState] = useState("");
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({});
  const [slotNotes, setSlotNotes] = useState<Record<string, string>>({});
  const [guestNames, setGuestNames] = useState<Record<string, string>>({});
  const [guestInput, setGuestInput] = useState("");
  const [pickingSlot, setPickingSlot] = useState<FormationSlot | null>(null);
  const [substitutes, setSubstitutes] = useState<string[]>([]);
  const [tactics, setTactics] = useState<TacticalNotes>(emptyTacticalNotes());
  const [selectedLine, setSelectedLine] = useState<Line>("verdediging");
  const [selectedSetPieceIds, setSelectedSetPieceIds] = useState<string[]>([]);
  const [drawings, setDrawings] = useState<Record<string, DrawingElement[]>>({});
  const [openDrawingKey, setOpenDrawingKey] = useState<string | null>(null);
  const [warmupId, setWarmupId] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);

  const reload = () =>
    Promise.all([
      api.list("players"),
      api.list("matches"),
      api.list("clubs"),
      api.list("match_preparations"),
      api.list("match_stats"),
      api.list("load_entries"),
      api.list("wash_duty"),
      api.list("carpool_duty"),
      api.list("video_links"),
      api.list("absences"),
      api.list("warmups"),
      api.list("set_pieces"),
    ])
      .then(([p, m, c, prep, stats, load, wash, carpool, videos, abs, wu, sp]) => {
        setPlayers([...p].sort((a, b) => a.name.localeCompare(b.name, "nl")));
        setMatches([...m].sort((a, b) => `${a.date} ${a.kickoff_time}`.localeCompare(`${b.date} ${b.kickoff_time}`)));
        setClubs(c);
        setPreparations(prep);
        setMatchStats(stats);
        setLoadEntries(load);
        setWashDuty(wash);
        setCarpoolDuty(carpool);
        setVideoLinks(videos);
        setAbsences(abs);
        setWarmups([...wu].sort((a, b) => a.name.localeCompare(b.name, "nl")));
        setSetPieces(sp);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (preselectMatch && matches.some((m) => m.id === preselectMatch) && selectedMatch !== preselectMatch) {
      loadMatch(preselectMatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectMatch, matches]);

  useEffect(() => {
    setGuestInput(pickingSlot ? guestNames[pickingSlot.id] ?? "" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickingSlot]);

  const activePlayers = players.filter((p) => p.active);
  const approvedSetPieces = setPieces.filter((sp) => sp.approved);
  const currentPrep = preparations.find((prep) => prep.match_id === selectedMatch);
  const slots = layoutForFormation(formation);
  const usedPlayerIds = new Set(Object.values(slotAssignments));
  const filledCount = Object.keys(slotAssignments).length;
  const upcomingMatches = [...matches]
    .filter((m) => !isPlayed(m))
    .sort((a, b) => `${a.date} ${a.kickoff_time}`.localeCompare(`${b.date} ${b.kickoff_time}`));

  function applyPreparation(prep: MatchPreparation | undefined) {
    setFormationState(prep?.formation ?? "");
    setWarmupId(prep?.warmup_id ?? "");
    const a: Record<string, string> = {};
    const notes: Record<string, string> = {};
    const guests: Record<string, string> = {};
    (prep?.lineup ?? []).forEach((entry) => {
      if (entry.guest_name) {
        a[entry.slot] = `guest:${entry.slot}`;
        guests[entry.slot] = entry.guest_name;
      } else if (entry.player_id) {
        a[entry.slot] = entry.player_id;
      }
      if (entry.note) notes[entry.slot] = entry.note;
    });
    setSlotAssignments(a);
    setSlotNotes(notes);
    setGuestNames(guests);
    setGuestInput("");
    setSubstitutes(prep?.substitutes ?? []);
    setPickingSlot(null);
    setTactics(mergeTacticalNotes(prep?.tactical_notes));
    setSelectedLine("verdediging");
    setSelectedSetPieceIds(prep?.set_piece_ids ?? []);
    setDrawings(prep?.drawings ?? {});
    setOpenDrawingKey(null);
  }

  function loadMatch(matchId: string) {
    setSelectedMatch(matchId);
    applyPreparation(preparations.find((p) => p.match_id === matchId));
    setCopyOpen(false);
    setMsg(null);
  }

  function copyPreparationFrom(matchId: string) {
    const source = matches.find((m) => m.id === matchId);
    const prep = preparations.find((p) => p.match_id === matchId);
    if (!prep) return;
    applyPreparation(prep);
    setCopyOpen(false);
    setMsg(
      `Voorbereiding gekopieerd van ${
        source ? `${formatDateShort(source.date)} · ${source.home_away === "away" ? `${source.opponent} — Steenwijkerwold` : `Steenwijkerwold — ${source.opponent}`}` : "de vorige wedstrijd"
      } — controleer en klik op Opslaan.`
    );
    setErr(false);
  }

  function selectFormation(f: string) {
    setFormationState(f);
    const validIds = new Set(layoutForFormation(f).map((s) => s.id));
    setSlotAssignments((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => validIds.has(id))));
    setSlotNotes((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => validIds.has(id))));
    setGuestNames((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => validIds.has(id))));
    setPickingSlot(null);
  }

  function assignSlot(slotId: string, playerId: string) {
    setSlotAssignments((prev) => ({ ...prev, [slotId]: playerId }));
    setGuestNames((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }

  function assignGuestSlot(slotId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setGuestNames((prev) => ({ ...prev, [slotId]: trimmed }));
    setSlotAssignments((prev) => ({ ...prev, [slotId]: `guest:${slotId}` }));
  }

  function clearSlot(slotId: string) {
    setSlotAssignments((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setGuestNames((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setPickingSlot(null);
  }

  function updateSlotNote(slotId: string, value: string) {
    setSlotNotes((prev) => ({ ...prev, [slotId]: value }));
  }

  function updateTeamTactic(moment: TacticalMoment, value: string) {
    setTactics((prev) => ({ ...prev, team: { ...prev.team, [moment]: value } }));
  }

  function updateLineTactic(line: Line, moment: TacticalMoment, value: string) {
    setTactics((prev) => ({ ...prev, line: { ...prev.line, [line]: { ...prev.line[line], [moment]: value } } }));
  }

  function toggleSubstitute(playerId: string) {
    setSubstitutes((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  }

  function toggleSetPiece(id: string) {
    setSelectedSetPieceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!selectedMatch) return;
    setBusy(true);
    try {
      const lineup = Object.entries(slotAssignments).map(([slot, value]) =>
        isGuestId(value)
          ? { slot, player_id: null, guest_name: guestNames[slot]?.trim() || "Gast", note: slotNotes[slot]?.trim() || null }
          : { slot, player_id: value, guest_name: null, note: slotNotes[slot]?.trim() || null }
      );
      const finalSubstitutes = substitutes.filter((id) => !usedPlayerIds.has(id));
      const patch = {
        match_id: selectedMatch,
        formation: formation || null,
        warmup_id: warmupId || null,
        lineup,
        substitutes: finalSubstitutes,
        tactical_notes: trimTacticalNotes(tactics),
        set_piece_ids: selectedSetPieceIds,
        drawings,
      };
      if (currentPrep) {
        await api.update("match_preparations", currentPrep.id, patch);
      } else {
        await api.create("match_preparations", patch);
      }
      await reload();
      setMsg("Wedstrijdvoorbereiding opgeslagen.");
      setErr(false);
    } catch (e) {
      setMsg((e as Error).message);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function updateScore(field: "score_for" | "score_against", value: string) {
    if (!selected) return;
    const n = value === "" ? null : parseInt(value, 10);
    await api.update("matches", selected.id, { [field]: isNaN(n as number) ? null : n });
    await reload();
  }

  async function saveStat(playerId: string, field: "goals" | "assists" | "minutes_played" | "rating", value: string) {
    if (!selected) return;
    const n =
      field === "rating"
        ? (() => {
            const r = parseInt(value, 10);
            return r >= 1 && r <= 10 ? r : null;
          })()
        : value === ""
          ? 0
          : parseInt(value, 10) || 0;

    // Altijd verse data ophalen i.p.v. de mogelijk verouderde matchStats-state te gebruiken:
    // anders kunnen twee snel na elkaar verlaten invoervelden allebei denken dat er nog geen
    // rij bestaat en elk hun eigen rij aanmaken, waardoor een wedstrijd dubbel meetelt.
    const freshStats: MatchStat[] = await api.list("match_stats");
    const existingForPair = freshStats.filter((s) => s.player_id === playerId && s.match_id === selected.id);

    if (existingForPair.length > 0) {
      const [keep, ...dupes] = existingForPair;
      await api.update("match_stats", keep.id, { [field]: n });
      if (dupes.length > 0) await Promise.all(dupes.map((d) => api.remove("match_stats", d.id)));
    } else {
      await api.create("match_stats", {
        match_id: selected.id,
        player_id: playerId,
        goals: field === "goals" ? (n as number) : 0,
        assists: field === "assists" ? (n as number) : 0,
        minutes_played: field === "minutes_played" ? (n as number) : 0,
        rating: field === "rating" ? (n as number | null) : null,
      });
    }
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;

  const selected = matches.find((m) => m.id === selectedMatch);

  function prepChecklist(m: Match) {
    const prep = preparations.find((p) => p.match_id === m.id);
    const slots = prep?.formation ? layoutForFormation(prep.formation) : [];
    const filledSlots = prep?.lineup.filter((l) => l.player_id || l.guest_name).length ?? 0;
    const lineupDone = slots.length > 0 && filledSlots >= slots.length;

    const tactics = prep?.tactical_notes;
    const tacticsDone =
      !!tactics &&
      (Object.values(tactics.team).some((v) => v.trim()) ||
        Object.values(tactics.line).some((line) => Object.values(line).some((v) => v.trim())));

    const standardDone = !!(prep?.set_piece_ids && prep.set_piece_ids.length > 0);

    return [
      { label: "Opstelling", done: lineupDone, detail: slots.length > 0 ? `${filledSlots}/${slots.length}` : null },
      { label: "Tactiek", done: tacticsDone, detail: null as string | null },
      { label: "Standaard", done: standardDone, detail: null as string | null },
    ];
  }

  function matchTile(m: Match, isNext: boolean) {
    const isSelected = selectedMatch === m.id;
    const checklist = prepChecklist(m);
    return (
      <button
        key={m.id}
        onClick={() => loadMatch(m.id)}
        className={`rounded-xl border p-3 text-left transition ${
          isSelected
            ? "border-rose-600 bg-rose-50 ring-1 ring-rose-600"
            : "border-slate-200 bg-white hover:border-rose-400"
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">{formatDateShort(m.date)} · {m.kickoff_time}</span>
          <div className="flex items-center gap-1">
            {isNext && <Badge color="amber">eerstvolgende</Badge>}
            <Badge color={m.home_away === "home" ? "green" : "blue"}>
              {m.home_away === "home" ? "Thuis" : "Uit"}
            </Badge>
          </div>
        </div>
        <div className="font-semibold">
          {m.home_away === "away" ? `${m.opponent} — Steenwijkerwold` : `Steenwijkerwold — ${m.opponent}`}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {checklist.map((c) => (
            <span
              key={c.label}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                c.done ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"
              }`}
            >
              {c.done ? "✓" : "○"} {c.label}
              {c.detail ? ` ${c.detail}` : ""}
            </span>
          ))}
        </div>
      </button>
    );
  }

  function renderDrawingSlot(slotKey: string) {
    const strokes = drawings[slotKey];
    return (
      <div className="mt-2">
        {strokes && strokes.length > 0 ? (
          <div className="flex flex-col items-start gap-2">
            <DrawingThumbnail strokes={strokes} />
            <div className="flex gap-3">
              <button onClick={() => setOpenDrawingKey(slotKey)} className="text-xs font-medium text-rose-600 hover:underline">
                ✏️ Bewerk tekening
              </button>
              <button
                onClick={() => setDrawings((prev) => { const next = { ...prev }; delete next[slotKey]; return next; })}
                className="text-xs text-red-500 hover:underline"
              >
                verwijderen
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setOpenDrawingKey(slotKey)}
            className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-rose-400 hover:text-rose-600"
          >
            ✏️ Tekening toevoegen
          </button>
        )}
      </div>
    );
  }

  const copyableMatches = [...matches]
    .filter((m) => m.id !== selectedMatch && preparations.some((p) => p.match_id === m.id))
    .sort((a, b) => `${b.date} ${b.kickoff_time}`.localeCompare(`${a.date} ${a.kickoff_time}`));

  const selectedIsPlayed = selected ? isPlayed(selected) : false;
  const times = selected ? computeMatchTimes(selected, clubs) : null;
  const selectedStats = selected ? matchStats.filter((s) => s.match_id === selected.id) : [];
  const selectedLoad = selected ? loadEntries.filter((e) => e.date === selected.date) : [];
  const selectedVideos = selected ? videoLinks.filter((v) => v.match_id === selected.id) : [];
  const selectedWash = selected ? washDuty.find((w) => w.match_id === selected.id) : undefined;
  const selectedCarpool = selected ? carpoolDuty.filter((c) => c.match_id === selected.id) : [];
  const washPlayer = selectedWash ? players.find((p) => p.id === selectedWash.player_id) : null;
  const drivers = selectedCarpool.map((d) => players.find((p) => p.id === d.player_id)).filter(Boolean) as Player[];
  const absentPlayerIds = new Set(
    selected
      ? absences.filter((a) => a.player_id && selected.date >= a.from && selected.date <= a.until).map((a) => a.player_id as string)
      : []
  );

  return (
    <div>
      <PageTitle
        title="Wedstrijdvoorbereiding"
        subtitle="Bereid per wedstrijd de opstelling, tactiek en standaardsituaties voor. Uitslagen en statistieken van gespeelde wedstrijden vind je bij Resultaten."
      />

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Nog te spelen</h2>
        {upcomingMatches.length === 0 ? (
          <p className="text-sm text-slate-500">Geen aankomende wedstrijden — importeer eerst het programma.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingMatches.map((m, i) => matchTile(m, i === 0))}
          </div>
        )}
      </Card>

      {selected && (
        <>
          <fieldset disabled={!canEdit} className="contents">
          <Card className="mb-6">
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="font-semibold">
                {selected.home_away === "away" ? `${selected.opponent} — Steenwijkerwold` : `Steenwijkerwold — ${selected.opponent}`}
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setCopyOpen((v) => !v)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    📋 Kopieer wedstrijdvoorbereiding
                  </button>
                  {copyOpen && (
                    <div className="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                      {copyableMatches.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-slate-500">
                          Nog geen andere wedstrijd met een ingevulde voorbereiding.
                        </p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto">
                          {copyableMatches.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => copyPreparationFrom(m.id)}
                              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                            >
                              <span className="font-medium text-slate-700">{formatDateShort(m.date)}</span>{" "}
                              <span className="text-slate-500">
                                {m.home_away === "away" ? `${m.opponent} — Steenwijkerwold` : `Steenwijkerwold — ${m.opponent}`}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Link
                  href={`/wedstrijden/print/${selected.id}`}
                  target="_blank"
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  🖨️ Print / PDF
                </Link>
              </div>
            </div>
            <p className="mb-4 text-sm text-slate-500">{formatDate(selected.date)} · aftrap {selected.kickoff_time}</p>

            <span className="mb-1 block text-sm text-slate-600">Formatie</span>
            <div className="mb-4 flex flex-wrap gap-2">
              {FORMATION_PRESETS.map((f) => (
                <button
                  key={f}
                  onClick={() => selectFormation(f)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    formation === f ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600"
                  }`}
                >
                  {f}
                </button>
              ))}
              <input
                className={`${inputCls} w-32`}
                placeholder="Anders…"
                value={FORMATION_PRESETS.includes(formation) ? "" : formation}
                onChange={(e) => selectFormation(e.target.value)}
              />
            </div>

            <span className="mb-1 block text-sm text-slate-600">Warming-up</span>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <select className={`${inputCls} w-full max-w-xs`} value={warmupId} onChange={(e) => setWarmupId(e.target.value)}>
                <option value="">— Geen gekozen —</option>
                {warmups.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <Link href="/training/warmingups" className="text-xs text-rose-600 hover:underline">
                Beheer warming-ups →
              </Link>
            </div>
            {warmupId && warmups.find((w) => w.id === warmupId)?.description && (
              <p className="mb-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                {warmups.find((w) => w.id === warmupId)?.description}
              </p>
            )}

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-600">Tik op een positie om een speler te plaatsen</span>
              {slots.length > 0 && (
                <Badge color={filledCount === slots.length ? "green" : "amber"}>
                  Basis: {filledCount}/{slots.length}
                </Badge>
              )}
            </div>

            {slots.length === 0 ? (
              <p className="text-sm text-slate-500">Kies of typ hierboven een formatie om het veld te tonen.</p>
            ) : (
              <div
                className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border-2 border-white/80 shadow-inner"
                style={{ aspectRatio: "2 / 3", background: "linear-gradient(180deg, #16a34a, #15803d)" }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(180deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 10%, transparent 10%, transparent 20%)",
                  }}
                />
                <div className="absolute left-0 right-0 top-1/2 h-px bg-white/50" />
                <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
                <div className="absolute left-1/2 top-0 h-[13%] w-[58%] -translate-x-1/2 border border-t-0 border-white/50" />
                <div className="absolute left-1/2 bottom-0 h-[13%] w-[58%] -translate-x-1/2 border border-b-0 border-white/50" />

                {slots.map((slot) => {
                  const playerId = slotAssignments[slot.id];
                  const player = resolveSlotPlayer(playerId, guestNames, players);
                  const isPicking = pickingSlot?.id === slot.id;
                  const hasNote = !!slotNotes[slot.id]?.trim();
                  const isAbsent = !!playerId && !player?.isGuest && absentPlayerIds.has(playerId);
                  return (
                    <button
                      key={slot.id}
                      onClick={() => setPickingSlot(isPicking ? null : slot)}
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                    >
                      <span className="relative">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold shadow ${
                            isAbsent
                              ? "border-red-400 bg-red-600 text-white"
                              : player
                                ? player.isGuest
                                  ? "border-white bg-purple-700 text-white"
                                  : "border-white bg-slate-900 text-white"
                                : isPicking
                                  ? "border-amber-400 bg-amber-400/40 text-white"
                                  : "border-dashed border-white/70 bg-white/10 text-white/80"
                          }`}
                        >
                          {player ? (player.isGuest ? "G" : (player.shirtNumber ?? "•")) : slot.label}
                        </span>
                        {hasNote && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-amber-400" />
                        )}
                        {isAbsent && (
                          <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-700 text-[9px]">
                            🚫
                          </span>
                        )}
                      </span>
                      <span className="max-w-[64px] truncate rounded bg-black/50 px-1 text-[10px] leading-tight text-white">
                        {player ? player.name.split(" ")[0] : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {pickingSlot && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Kies speler voor positie {pickingSlot.label}</span>
                  <button onClick={() => setPickingSlot(null)} className="text-xs text-slate-500 hover:underline">
                    sluiten
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {slotAssignments[pickingSlot.id] && (
                    <button
                      onClick={() => clearSlot(pickingSlot.id)}
                      className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      ✕ Leegmaken
                    </button>
                  )}
                  {activePlayers
                    .filter((p) => !usedPlayerIds.has(p.id) || slotAssignments[pickingSlot.id] === p.id)
                    .sort((a, b) => Number(absentPlayerIds.has(a.id)) - Number(absentPlayerIds.has(b.id)))
                    .map((p) => {
                      const absent = absentPlayerIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => assignSlot(pickingSlot.id, p.id)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                            slotAssignments[pickingSlot.id] === p.id
                              ? "border-rose-600 bg-rose-600 text-white"
                              : absent
                                ? "border-red-200 bg-red-50 text-red-400"
                                : "border-slate-300 bg-white text-slate-700 hover:border-rose-600"
                          }`}
                        >
                          {p.shirt_number ? `#${p.shirt_number} ` : ""}
                          {p.name}
                          {absent && " 🚫 afwezig"}
                        </button>
                      );
                    })}
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block text-slate-500">Gastspeler (bv. iemand van een ander elftal)</span>
                    <input
                      type="text"
                      className={`${inputCls} w-full`}
                      placeholder="Naam gastspeler…"
                      value={guestInput}
                      onChange={(e) => setGuestInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && pickingSlot && assignGuestSlot(pickingSlot.id, guestInput)}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    onClick={() => pickingSlot && assignGuestSlot(pickingSlot.id, guestInput)}
                  >
                    Plaats gast
                  </Button>
                </div>
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-slate-500">Opmerking voor deze positie</span>
                  <input
                    type="text"
                    className={`${inputCls} w-full`}
                    placeholder="Bv. let op de counter, dek de nummer 9 direct op…"
                    value={slotNotes[pickingSlot.id] ?? ""}
                    onChange={(e) => updateSlotNote(pickingSlot.id, e.target.value)}
                  />
                </label>
              </div>
            )}
          </Card>

          <Card className="mb-6">
            <h2 className="mb-1 font-semibold">Wisselspelers</h2>
            <p className="mb-3 text-xs text-slate-500">Overige beschikbare spelers die niet in de basisopstelling staan.</p>
            <div className="flex flex-wrap gap-2">
              {activePlayers.filter((p) => !usedPlayerIds.has(p.id)).length === 0 ? (
                <p className="text-sm text-slate-500">Geen spelers over — iedereen staat al in de basis.</p>
              ) : (
                activePlayers
                  .filter((p) => !usedPlayerIds.has(p.id))
                  .sort((a, b) => Number(absentPlayerIds.has(a.id)) - Number(absentPlayerIds.has(b.id)))
                  .map((p) => {
                    const absent = absentPlayerIds.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleSubstitute(p.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                          substitutes.includes(p.id)
                            ? "border-blue-600 bg-blue-600 text-white"
                            : absent
                              ? "border-red-200 bg-red-50 text-red-400"
                              : "border-slate-300 text-slate-600"
                        }`}
                      >
                        {p.name}
                        {absent && " 🚫 afwezig"}
                      </button>
                    );
                  })
              )}
            </div>
          </Card>

          <Card className="mb-6">
            <h2 className="mb-4 font-semibold">Tactische aandachtspunten</h2>

            <h3 className="mb-2 text-sm font-semibold text-slate-700">Team-niveau</h3>
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              {TACTICAL_MOMENTS.map((moment) => (
                <label key={moment.key} className="text-sm">
                  <span className="mb-1 block text-slate-500">{moment.label}</span>
                  <textarea
                    className={`${inputCls} w-full`}
                    rows={3}
                    value={tactics.team[moment.key]}
                    onChange={(e) => updateTeamTactic(moment.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            {renderDrawingSlot("team")}

            <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Linie-niveau</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {LINES.map((l) => {
                const filledCount = TACTICAL_MOMENTS.filter((m) => tactics.line[l.key][m.key].trim()).length;
                return (
                  <button
                    key={l.key}
                    onClick={() => setSelectedLine(l.key)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      selectedLine === l.key ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600"
                    }`}
                  >
                    {l.label}
                    {filledCount > 0 && (
                      <span className={`ml-1.5 text-xs ${selectedLine === l.key ? "text-rose-100" : "text-slate-500"}`}>
                        {filledCount}/4
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TACTICAL_MOMENTS.map((moment) => (
                <label key={moment.key} className="text-sm">
                  <span className="mb-1 block text-slate-500">{moment.label}</span>
                  <textarea
                    className={`${inputCls} w-full`}
                    rows={3}
                    value={tactics.line[selectedLine][moment.key]}
                    onChange={(e) => updateLineTactic(selectedLine, moment.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            {renderDrawingSlot(`line:${selectedLine}`)}
          </Card>

          <Card className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Standaardsituaties</h2>
              <Link href="/spelhervattingen" className="text-xs text-rose-600 hover:underline">
                Beheer spelhervattingen →
              </Link>
            </div>
            {approvedSetPieces.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nog geen goedgekeurde spelhervattingen. Voeg ze toe via{" "}
                <Link href="/spelhervattingen" className="text-rose-600 hover:underline">Spelhervattingen</Link>.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {SET_PIECE_CATEGORIES.map((cat) => {
                  const inCategory = approvedSetPieces.filter((sp) => sp.category === cat);
                  if (inCategory.length === 0) return null;
                  return (
                    <div key={cat}>
                      <h3 className="mb-1.5 text-sm font-semibold text-slate-700">{SET_PIECE_CATEGORY_LABELS[cat]}</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {SET_PIECE_SIDES.map((side) => {
                          const items = inCategory.filter((sp) => sp.side === side);
                          if (items.length === 0) return null;
                          return (
                            <div key={side}>
                              <span className="mb-1 block text-xs text-slate-500">{SET_PIECE_SIDE_LABELS[side]}</span>
                              <div className="flex flex-wrap gap-1.5">
                                {items.map((sp) => (
                                  <button
                                    key={sp.id}
                                    onClick={() => toggleSetPiece(sp.id)}
                                    title={sp.description || undefined}
                                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                                      selectedSetPieceIds.includes(sp.id)
                                        ? "border-rose-600 bg-rose-600 text-white"
                                        : "border-slate-300 bg-white text-slate-600 hover:border-rose-300"
                                    }`}
                                  >
                                    {sp.title}
                                  </button>
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
          </Card>

          <div className="mb-6 flex items-center gap-3">
            <Button onClick={save} disabled={busy}>{busy ? "Opslaan…" : "Opslaan"}</Button>
            <Message text={msg} error={err} />
          </div>
          </fieldset>

          {selectedIsPlayed && (
            <>
              <Card className="mb-6">
                <h2 className="mb-3 font-semibold">Wedstrijdresultaat</h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Uitslag</span>
                      <fieldset disabled={!canEdit} className="contents">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          className={`${inputCls} w-14`}
                          defaultValue={selected.score_for ?? ""}
                          placeholder="-"
                          onBlur={(e) => e.target.value !== String(selected.score_for ?? "") && updateScore("score_for", e.target.value)}
                        />
                        <span className="text-slate-500">–</span>
                        <input
                          type="number"
                          min={0}
                          className={`${inputCls} w-14`}
                          defaultValue={selected.score_against ?? ""}
                          placeholder="-"
                          onBlur={(e) =>
                            e.target.value !== String(selected.score_against ?? "") && updateScore("score_against", e.target.value)
                          }
                        />
                      </div>
                      </fieldset>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Aanwezig op locatie</span>
                      <span className="font-medium">{times?.arrive ?? "—"}</span>
                    </div>
                    {selected.home_away === "away" && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Vertrek (Sportpark)</span>
                        <span className="font-medium">
                          {times?.depart ?? <span className="text-xs text-amber-600">reistijd invullen bij Programma</span>}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Wasbeurt 🧺</span>
                      <span className="font-medium">{washPlayer?.name ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Rijders 🚗</span>
                      <span className="font-medium">
                        {selected.home_away === "away" ? (drivers.length > 0 ? drivers.map((d) => d.name).join(", ") : "—") : "n.v.t. (thuis)"}
                      </span>
                    </div>
                    <Link href="/schema" className="mt-1 text-xs text-rose-600 hover:underline">
                      Bewerk in Was &amp; rijden →
                    </Link>
                  </div>
                </div>
              </Card>

              <Card className="mb-6">
                <h2 className="mb-3 font-semibold">Statistieken</h2>
                <fieldset disabled={!canEdit} className="contents">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className={thCls}>Speler</th>
                        <th className={thCls}>Minuten</th>
                        <th className={thCls}>Goals</th>
                        <th className={thCls}>Assists</th>
                        <th className={thCls}>Beoordeling (1-10)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePlayers.map((p) => {
                        const s = selectedStats.find((x) => x.player_id === p.id);
                        return (
                          <tr key={p.id} className="border-b border-slate-100">
                            <td className={`${tdCls} font-medium`}>{p.name}</td>
                            <td className={tdCls}>
                              <input
                                type="number"
                                min={0}
                                max={130}
                                className={`${inputCls} w-20`}
                                defaultValue={s?.minutes_played || ""}
                                placeholder="0"
                                onBlur={(e) =>
                                  e.target.value !== String(s?.minutes_played || "") &&
                                  saveStat(p.id, "minutes_played", e.target.value)
                                }
                              />
                            </td>
                            <td className={tdCls}>
                              <input
                                type="number"
                                min={0}
                                className={`${inputCls} w-20`}
                                defaultValue={s?.goals || ""}
                                placeholder="0"
                                onBlur={(e) => e.target.value !== String(s?.goals || "") && saveStat(p.id, "goals", e.target.value)}
                              />
                            </td>
                            <td className={tdCls}>
                              <input
                                type="number"
                                min={0}
                                className={`${inputCls} w-20`}
                                defaultValue={s?.assists || ""}
                                placeholder="0"
                                onBlur={(e) => e.target.value !== String(s?.assists || "") && saveStat(p.id, "assists", e.target.value)}
                              />
                            </td>
                            <td className={tdCls}>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                className={`${inputCls} w-20`}
                                defaultValue={s?.rating ?? ""}
                                placeholder="—"
                                onBlur={(e) => e.target.value !== String(s?.rating ?? "") && saveStat(p.id, "rating", e.target.value)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </fieldset>
              </Card>

              <Card className="mb-6">
                <h2 className="mb-1 font-semibold">Belasting</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Ingevoerde minuten/RPE en wellness-scores op {formatDate(selected.date)}.
                </p>
                {selectedLoad.length === 0 ? (
                  <p className="text-sm text-slate-500">Nog geen belasting ingevoerd voor deze datum.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className={thCls}>Speler</th>
                          <th className={thCls}>Minuten</th>
                          <th className={thCls}>RPE</th>
                          <th className={thCls}>Belasting</th>
                          <th className={thCls}>Vermoeidheid</th>
                          <th className={thCls}>Spierpijn</th>
                          <th className={thCls}>Blessure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLoad.map((e) => (
                          <tr key={e.id} className={`border-b border-slate-100 ${e.absent ? "opacity-60" : ""}`}>
                            <td className={`${tdCls} font-medium`}>{players.find((p) => p.id === e.player_id)?.name ?? "—"}</td>
                            {e.absent ? (
                              <td className={tdCls} colSpan={5}>
                                <Badge color="slate">🚫 Afwezig</Badge>
                              </td>
                            ) : (
                              <>
                                <td className={tdCls}>{e.minutes}</td>
                                <td className={tdCls}>{e.rpe}</td>
                                <td className={`${tdCls} font-medium`}>{(e.minutes ?? 0) * (e.rpe ?? 0)}</td>
                                <td className={tdCls}>{e.fatigue ? `${e.fatigue}/10` : "—"}</td>
                                <td className={tdCls}>{e.soreness ? `${e.soreness}/10` : "—"}</td>
                                <td className={tdCls}>{e.injury_flag ? <Badge color="red">⚠️</Badge> : "—"}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <Link href="/belasting" className="mt-3 inline-block text-xs text-rose-600 hover:underline">
                  Bewerk in Belasting →
                </Link>
              </Card>

              <Card className="mb-6">
                <h2 className="mb-3 font-semibold">Analyses</h2>
                {selectedVideos.length === 0 ? (
                  <p className="text-sm text-slate-500">Nog geen video gekoppeld aan deze wedstrijd.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {selectedVideos.map((v) => (
                      <li key={v.id} className="rounded-lg border border-slate-100 px-3 py-2">
                        <span className="font-medium">{v.title || "Zonder titel"}</span>{" "}
                        <span className="text-slate-500">— {v.veo_url}</span>
                        {v.ai_advice && <span className="ml-2 text-rose-700">✓ advies aanwezig</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`/resultaten?match=${selected.id}`} className="mt-3 inline-block text-xs text-rose-600 hover:underline">
                  Open in Resultaten →
                </Link>
              </Card>
            </>
          )}
        </>
      )}

      {openDrawingKey && (
        <TacticsBoardModal
          title={drawingLabel(openDrawingKey)}
          initialStrokes={drawings[openDrawingKey] ?? []}
          onClose={() => setOpenDrawingKey(null)}
          onSave={(strokes) => {
            setDrawings((prev) => ({ ...prev, [openDrawingKey]: strokes }));
            setOpenDrawingKey(null);
          }}
        />
      )}
    </div>
  );
}
