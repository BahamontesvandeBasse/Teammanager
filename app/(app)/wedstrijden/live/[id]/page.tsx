"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { resolveSlotPlayer } from "@/lib/formations";
import {
  DEFAULT_HALF_MINUTES,
  OBSERVATION_MOMENTS,
  computeMinutesPlayed,
  currentHalf,
  currentMinute,
  emptyClock,
  formatClock,
  formatMinute,
  momentLabel,
  onFieldPlayerIds,
  phaseLabel,
  scoreFromEvents,
  sortEvents,
} from "@/lib/live";
import { Badge, Card, inputCls } from "@/components/ui";
import {
  LiveClock,
  Match,
  MatchEvent,
  MatchEventType,
  MatchPreparation,
  MatchStat,
  ObservationMoment,
  Player,
  TacticalMoment,
} from "@/lib/types";
import { useCanEdit, useRole } from "@/lib/auth/RoleProvider";

// Live-wedstrijdmodus voor de staf: wedstrijd starten op telefoon/tablet/laptop,
// tijdens de wedstrijd goals/assists/wissels/kaarten en observaties vastleggen,
// en die direct gebruiken voor de rustbespreking en de nabespreking. Meerdere
// stafleden kunnen tegelijk meekijken/invoeren: de pagina ververst zichzelf.

const POLL_MS = 8000;

type Tab = "live" | "rust" | "nabespreking";
type SheetKind = "goal_for" | "goal_against" | "substitution" | "card" | "observation";
type Sheet = { kind: SheetKind; event?: MatchEvent };

type CounterField =
  | "shots_for"
  | "shots_against"
  | "shots_on_target_for"
  | "shots_on_target_against"
  | "corners_for"
  | "corners_against"
  | "fouls_for"
  | "fouls_against";

const COUNTERS: { label: string; for: CounterField; against: CounterField }[] = [
  { label: "Schoten", for: "shots_for", against: "shots_against" },
  { label: "Op doel", for: "shots_on_target_for", against: "shots_on_target_against" },
  { label: "Corners", for: "corners_for", against: "corners_against" },
  { label: "Overtredingen", for: "fouls_for", against: "fouls_against" },
];

type ReviewField = "halftime_talk" | "review_went_well" | "review_improve" | "review_training";
const REVIEW_FIELDS: ReviewField[] = ["halftime_talk", "review_went_well", "review_improve", "review_training"];

// Snelle zinnetjes per moment: tikken i.p.v. typen langs de lijn.
const QUICK_PHRASES: Record<ObservationMoment, string[]> = {
  attacking: ["Goed positiespel", "Breedte goed benut", "Te weinig diepte", "Te snel balverlies", "Laatste pass mist"],
  defending: ["Goed compact", "Duels gewonnen", "Geen druk op de bal", "Te veel ruimte tussen de linies", "Rugdekking ontbreekt"],
  transition_to_attack: ["Snel vooruit gespeeld", "Te traag omgeschakeld", "Niemand gaat mee in de diepte"],
  transition_to_defense: ["Direct druk na balverlies", "Te laat terug", "Counter weggegeven"],
  standaard: ["Vrije trap goed uitgevoerd", "Corner tegen slecht verdedigd", "Niemand bij de tweede bal"],
  overig: ["Goede mentaliteit", "Coaching onderling goed", "Energie zakt in", "Te veel praten tegen scheids"],
};

const EVENT_ICON: Record<MatchEventType, string> = {
  goal_for: "⚽",
  goal_against: "🥅",
  substitution: "🔁",
  card_yellow: "🟨",
  card_red: "🟥",
  observation: "📝",
};

function playerLabel(p: Player | undefined): string {
  if (!p) return "Onbekend";
  return `${p.shirt_number ? `#${p.shirt_number} ` : ""}${p.name}`;
}

function firstName(p: Player | undefined): string {
  return p ? p.name.split(" ")[0] : "?";
}

export default function LiveMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const role = useRole();
  const canEdit = useCanEdit();

  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [prep, setPrep] = useState<MatchPreparation | undefined>(undefined);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<MatchStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("live");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [halfMinutesChoice, setHalfMinutesChoice] = useState(DEFAULT_HALF_MINUTES);
  const [showAgreements, setShowAgreements] = useState(false);

  const [drafts, setDrafts] = useState<Record<ReviewField, string>>({
    halftime_talk: "",
    review_went_well: "",
    review_improve: "",
    review_training: "",
  });
  const dirty = useRef(new Set<ReviewField>());
  const saveTimers = useRef<Partial<Record<ReviewField, ReturnType<typeof setTimeout>>>>({});

  const applyMatch = useCallback((m: Match | undefined) => {
    if (!m) return;
    setMatch(m);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const f of REVIEW_FIELDS) if (!dirty.current.has(f)) next[f] = m[f] ?? "";
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const [m, ev] = await Promise.all([api.list("matches"), api.list("match_events")]);
    applyMatch(m.find((x) => x.id === id));
    setEvents(ev.filter((e) => e.match_id === id));
  }, [id, applyMatch]);

  useEffect(() => {
    Promise.all([
      api.list("matches"),
      api.list("players"),
      api.list("match_preparations"),
      api.list("match_events"),
      api.list("match_stats"),
    ])
      .then(([m, p, preps, ev, st]) => {
        applyMatch(m.find((x) => x.id === id));
        setPlayers(
          p
            .filter((x) => x.active)
            .sort((a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999) || a.name.localeCompare(b.name, "nl"))
        );
        setPrep(preps.find((x) => x.match_id === id));
        setEvents(ev.filter((e) => e.match_id === id));
        setStats(st.filter((s) => s.match_id === id));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id, applyMatch]);

  // Klok laten tikken + periodiek verversen zodat meerdere stafleden synchroon blijven.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh().catch(() => {});
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [refresh]);

  const clock: LiveClock = match?.live_clock ?? emptyClock(halfMinutesChoice);
  const running = clock.phase === "h1" || clock.phase === "h2";

  // Scherm aan houden tijdens een lopende helft (telefoon langs de lijn).
  useEffect(() => {
    if (!running || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [running]);

  if (loading) return <p className="text-slate-500">Laden…</p>;
  if (role === "speler") {
    return (
      <div>
        <p className="mb-2 font-semibold">Geen toegang</p>
        <Link href="/" className="text-sm text-rose-600 hover:underline">← Terug naar Dashboard</Link>
      </div>
    );
  }
  if (!match) return <p className="text-slate-500">Wedstrijd niet gevonden.</p>;

  const m = match;
  const sorted = sortEvents(events);
  const score = scoreFromEvents(events);
  const minuteNow = currentMinute(clock, now);
  const halfNow = currentHalf(clock);
  const onField = onFieldPlayerIds(prep, events);
  const playerById = (pid: string | null) => (pid ? players.find((p) => p.id === pid) : undefined);
  const guestNames = Object.fromEntries((prep?.lineup ?? []).filter((l) => l.guest_name).map((l) => [l.slot, l.guest_name as string]));
  const guestsOnField = (prep?.lineup ?? []).filter((l) => l.guest_name).map((l) => resolveSlotPlayer(`guest:${l.slot}`, guestNames, players));
  const hasLiveData = clock.phase !== "pre" || events.length > 0;

  const ourName = "Steenwijkerwold";
  const leftName = m.home_away === "away" ? m.opponent : ourName;
  const rightName = m.home_away === "away" ? ourName : m.opponent;
  const leftScore = m.home_away === "away" ? score.against : score.for;
  const rightScore = m.home_away === "away" ? score.for : score.against;

  // ---------- schrijfacties ----------

  async function run(fn: () => Promise<void>) {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function setClock(next: LiveClock, extra: Partial<Match> = {}) {
    return run(async () => {
      setMatch((prev) => (prev ? { ...prev, live_clock: next, ...extra } : prev));
      await api.update("matches", m.id, { live_clock: next, ...extra });
    });
  }

  function advancePhase() {
    const iso = new Date().toISOString();
    if (clock.phase === "pre") {
      // 0-0 zetten bij de aftrap: dan staat de wedstrijd ook elders in de app als "bezig/gespeeld".
      const extra: Partial<Match> = m.score_for === null || m.score_against === null ? { score_for: 0, score_against: 0 } : {};
      return setClock({ ...emptyClock(halfMinutesChoice), phase: "h1", h1_start: iso }, extra);
    }
    if (clock.phase === "h1") {
      setTab("rust");
      return setClock({ ...clock, phase: "ht", h1_end: iso });
    }
    if (clock.phase === "ht") {
      setTab("live");
      return setClock({ ...clock, phase: "h2", h2_start: iso });
    }
    if (clock.phase === "h2") {
      if (!confirm("Wedstrijd afsluiten?")) return;
      setTab("nabespreking");
      return setClock({ ...clock, phase: "ft", h2_end: iso });
    }
  }

  function undoPhase() {
    const back: Record<LiveClock["phase"], LiveClock | null> = {
      pre: null,
      h1: { ...clock, phase: "pre", h1_start: null },
      ht: { ...clock, phase: "h1", h1_end: null },
      h2: { ...clock, phase: "ht", h2_start: null },
      ft: { ...clock, phase: "h2", h2_end: null },
    };
    const prev = back[clock.phase];
    if (prev && confirm(`Terug naar "${phaseLabel(prev)}"?`)) setClock(prev);
  }

  // Klok corrigeren als die te laat/vroeg is gestart (verschuift de start van de lopende helft).
  function shiftClock(minutes: number) {
    const key = clock.phase === "h1" ? "h1_start" : clock.phase === "h2" ? "h2_start" : null;
    if (!key || !clock[key]) return;
    const shifted = new Date(Date.parse(clock[key] as string) - minutes * 60000);
    setClock({ ...clock, [key]: shifted.toISOString() });
  }

  async function syncScore() {
    const fresh = (await api.list("match_events")).filter((e) => e.match_id === m.id);
    const s = scoreFromEvents(fresh);
    setEvents(fresh);
    await api.update("matches", m.id, { score_for: s.for, score_against: s.against });
    setMatch((prev) => (prev ? { ...prev, score_for: s.for, score_against: s.against } : prev));
    return fresh;
  }

  // Zelfde aanpak als saveStat op de wedstrijdpagina: altijd verse rijen ophalen
  // en eventuele dubbele rijen opruimen, zodat een wedstrijd nooit dubbel telt.
  async function upsertStat(playerId: string, patch: Partial<MatchStat>) {
    const fresh = (await api.list("match_stats")).filter((s) => s.match_id === m.id && s.player_id === playerId);
    if (fresh.length > 0) {
      const [keep, ...dupes] = fresh;
      await api.update("match_stats", keep.id, patch);
      if (dupes.length > 0) await Promise.all(dupes.map((d) => api.remove("match_stats", d.id)));
    } else {
      await api.create("match_stats", {
        match_id: m.id,
        player_id: playerId,
        goals: 0,
        assists: 0,
        minutes_played: 0,
        rating: null,
        ...patch,
      });
    }
  }

  // Goals/assists in de spelersstatistieken gelijk houden met de live-tijdlijn.
  async function syncPlayerStats(playerIds: (string | null)[], freshEvents: MatchEvent[]) {
    const ids = [...new Set(playerIds.filter((x): x is string => !!x))];
    for (const pid of ids) {
      const goals = freshEvents.filter((e) => e.type === "goal_for" && e.player_id === pid).length;
      const assists = freshEvents.filter((e) => e.type === "goal_for" && e.related_player_id === pid).length;
      await upsertStat(pid, { goals, assists });
    }
    setStats((await api.list("match_stats")).filter((s) => s.match_id === m.id));
  }

  function saveEvent(data: Omit<MatchEvent, "id" | "match_id" | "created_at" | "created_by_name">, existing?: MatchEvent) {
    return run(async () => {
      if (existing) {
        await api.update("match_events", existing.id, data);
      } else {
        await api.create("match_events", {
          ...data,
          match_id: m.id,
          created_at: new Date().toISOString(),
          created_by_name: null,
        });
      }
      setSheet(null);
      const touchesGoal = data.type.startsWith("goal") || existing?.type.startsWith("goal");
      if (touchesGoal) {
        const fresh = await syncScore();
        if (data.type === "goal_for" || existing?.type === "goal_for") {
          await syncPlayerStats([data.player_id, data.related_player_id, existing?.player_id ?? null, existing?.related_player_id ?? null], fresh);
        }
      } else {
        await refresh();
      }
    });
  }

  function deleteEvent(e: MatchEvent) {
    if (!confirm("Dit moment verwijderen?")) return;
    return run(async () => {
      setSheet(null);
      await api.remove("match_events", e.id);
      if (e.type.startsWith("goal")) {
        const fresh = await syncScore();
        if (e.type === "goal_for") await syncPlayerStats([e.player_id, e.related_player_id], fresh);
      } else {
        await refresh();
      }
    });
  }

  function toggleFlag(e: MatchEvent, field: "for_halftime" | "for_review") {
    return run(async () => {
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, [field]: !e[field] } : x)));
      await api.update("match_events", e.id, { [field]: !e[field] });
    });
  }

  function bumpCounter(field: CounterField, delta: number) {
    return run(async () => {
      setMatch((prev) => (prev ? { ...prev, [field]: Math.max(0, (prev[field] ?? 0) + delta) } : prev));
      // Verse waarde ophalen: een ander staflid kan net ook geteld hebben.
      const fresh = (await api.list("matches")).find((x) => x.id === m.id);
      const value = Math.max(0, (fresh?.[field] ?? 0) + delta);
      await api.update("matches", m.id, { [field]: value });
      setMatch((prev) => (prev ? { ...prev, [field]: value } : prev));
    });
  }

  function updateDraft(field: ReviewField, value: string) {
    dirty.current.add(field);
    setDrafts((prev) => ({ ...prev, [field]: value }));
    clearTimeout(saveTimers.current[field]);
    saveTimers.current[field] = setTimeout(() => flushDraft(field, value), 1200);
  }

  function flushDraft(field: ReviewField, value: string) {
    clearTimeout(saveTimers.current[field]);
    return run(async () => {
      await api.update("matches", m.id, { [field]: value.trim() || null });
      dirty.current.delete(field);
    });
  }

  async function writeMinutes(minutes: Record<string, number>) {
    if (!confirm("Speelminuten overnemen in de spelersstatistieken? Bestaande minuten van deze spelers worden overschreven.")) return;
    await run(async () => {
      for (const [pid, min] of Object.entries(minutes)) await upsertStat(pid, { minutes_played: min });
      setStats((await api.list("match_stats")).filter((s) => s.match_id === m.id));
    });
  }

  // ---------- weergave ----------

  function describe(e: MatchEvent): string {
    const p = playerById(e.player_id);
    const r = playerById(e.related_player_id);
    switch (e.type) {
      case "goal_for":
        return `Goal ${p ? playerLabel(p) : "(onbekend)"}${r ? ` · assist ${playerLabel(r)}` : ""}`;
      case "goal_against":
        return `Tegengoal${e.moment ? ` · ${momentLabel(e.moment)}` : ""}`;
      case "substitution":
        return `${p ? playerLabel(p) : "?"} erin · ${r ? playerLabel(r) : "?"} eruit`;
      case "card_yellow":
      case "card_red":
        return `${e.type === "card_red" ? "Rode" : "Gele"} kaart ${p ? playerLabel(p) : ""}`;
      case "observation":
        return `${momentLabel(e.moment)}${p ? ` · ${playerLabel(p)}` : ""}`;
    }
  }

  function eventRow(e: MatchEvent, opts: { flags?: boolean } = {}) {
    const isObs = e.type === "observation";
    return (
      <li key={e.id} className="flex items-start gap-3 py-2.5">
        <span className="w-12 shrink-0 pt-0.5 text-right font-mono text-xs font-semibold text-slate-500">
          {formatMinute(e.minute, e.half, clock.half_minutes)}
        </span>
        <span className="shrink-0 text-lg leading-none">
          {isObs ? (e.sentiment === "plus" ? "👍" : e.sentiment === "min" ? "👎" : "📝") : EVENT_ICON[e.type]}
        </span>
        <div className="min-w-0 flex-1">
          {/* In de per-moment-groepen staat het moment al in de kop — dan alleen de speler tonen. */}
          {!(isObs && opts.flags === false && !e.player_id) && (
            <p className={`text-sm ${isObs ? "text-slate-500" : "font-medium text-slate-900"}`}>
              {isObs && opts.flags === false ? playerLabel(playerById(e.player_id)) : describe(e)}
            </p>
          )}
          {e.note && <p className="text-sm text-slate-800">{e.note}</p>}
          {opts.flags !== false && isObs && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <FlagChip on={e.for_halftime} label="Rust" onClick={canEdit ? () => toggleFlag(e, "for_halftime") : undefined} />
              <FlagChip on={e.for_review} label="Nabespreking" onClick={canEdit ? () => toggleFlag(e, "for_review") : undefined} />
              {e.created_by_name && <span className="text-[11px] text-slate-400">— {e.created_by_name}</span>}
            </div>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => setSheet({ kind: kindForEvent(e), event: e })}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Bewerk"
          >
            ✎
          </button>
        )}
      </li>
    );
  }

  const prepNotes = prep?.tactical_notes?.team;
  const agreementFor = (moment: ObservationMoment): string => {
    if (!prepNotes || moment === "standaard" || moment === "overig") return "";
    return prepNotes[moment as TacticalMoment]?.trim() ?? "";
  };

  const observations = sorted.filter((e) => e.type === "observation");
  const halftimeObs = observations.filter((e) => e.for_halftime);
  const reviewObs = observations.filter((e) => e.for_review);
  const goalsAgainst = sorted.filter((e) => e.type === "goal_against");
  const keyEvents = sorted.filter((e) => e.type !== "observation");

  const header = (
    <div className="sticky top-0 z-20 -mx-4 mb-4 bg-slate-900 px-4 pb-3 pt-3 text-white shadow-lg md:-mx-8 md:rounded-b-xl md:px-8">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <Link href={`/wedstrijden?match=${m.id}`} className="text-slate-300 hover:text-white">← Voorbereiding</Link>
        <span className="flex items-center gap-1.5">
          {running && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
          <span className="font-medium uppercase tracking-wide text-slate-300">{phaseLabel(clock)}</span>
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="truncate text-right text-sm font-semibold sm:text-base">{leftName}</span>
        <span className="rounded-lg bg-white/10 px-3 py-1 font-mono text-3xl font-bold tabular-nums sm:text-4xl">
          {leftScore} – {rightScore}
        </span>
        <span className="truncate text-sm font-semibold sm:text-base">{rightName}</span>
      </div>
      <div className="mt-2 flex items-center justify-center gap-3">
        {running && canEdit && (
          <button onClick={() => shiftClock(-1)} className="rounded-md bg-white/10 px-2 py-1 text-xs" aria-label="Klok min 1 minuut">−1</button>
        )}
        <span className="font-mono text-xl tabular-nums text-amber-300">
          {formatClock(clock, now)}
          {running && minuteNow > (clock.phase === "h1" ? clock.half_minutes : clock.half_minutes * 2) && (
            <span className="ml-1 text-sm">(+{minuteNow - (clock.phase === "h1" ? clock.half_minutes : clock.half_minutes * 2)})</span>
          )}
        </span>
        {running && canEdit && (
          <button onClick={() => shiftClock(1)} className="rounded-md bg-white/10 px-2 py-1 text-xs" aria-label="Klok plus 1 minuut">+1</button>
        )}
      </div>
      {canEdit && clock.phase !== "ft" && (
        <div className="mt-2 flex items-center justify-center gap-2">
          {clock.phase === "pre" && (
            <select
              value={halfMinutesChoice}
              onChange={(e) => setHalfMinutesChoice(parseInt(e.target.value, 10))}
              className="rounded-lg bg-white/10 px-2 py-2 text-sm text-white"
              aria-label="Speelduur per helft"
            >
              {[45, 40, 35, 30, 25, 20].map((n) => (
                <option key={n} value={n} className="text-slate-900">2 × {n} min</option>
              ))}
            </select>
          )}
          <button onClick={advancePhase} className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-semibold hover:bg-rose-500">
            {{ pre: "▶ Aftrap 1e helft", h1: "⏸ Rust", ht: "▶ Aftrap 2e helft", h2: "⏹ Einde wedstrijd", ft: "" }[clock.phase]}
          </button>
          {clock.phase !== "pre" && (
            <button onClick={undoPhase} className="text-xs text-slate-400 hover:text-white" title="Vorige fase herstellen">↶</button>
          )}
        </div>
      )}
      {canEdit && clock.phase === "ft" && (
        <div className="mt-2 text-center">
          <button onClick={undoPhase} className="text-xs text-slate-400 hover:text-white">↶ Wedstrijd heropenen</button>
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-white/10 p-1 text-sm">
        {(["live", "rust", "nabespreking"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md py-1.5 font-medium ${tab === t ? "bg-white text-slate-900" : "text-slate-200"}`}
          >
            {{ live: "Live", rust: `Rust${halftimeObs.length ? ` (${halftimeObs.length})` : ""}`, nabespreking: "Nabespreking" }[t]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="pb-24">
      {header}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === "live" && (
        <>
          {canEdit && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <BigButton onClick={() => setSheet({ kind: "goal_for" })} className="bg-green-600 text-white hover:bg-green-700">⚽ Goal wij</BigButton>
              <BigButton onClick={() => setSheet({ kind: "goal_against" })} className="bg-slate-700 text-white hover:bg-slate-800">🥅 Goal tegen</BigButton>
              <BigButton onClick={() => setSheet({ kind: "observation" })} className="col-span-2 bg-rose-600 text-white hover:bg-rose-700 sm:col-span-1">📝 Wat zien we?</BigButton>
              <BigButton onClick={() => setSheet({ kind: "substitution" })} className="border border-slate-300 bg-white text-slate-800">🔁 Wissel</BigButton>
              <BigButton onClick={() => setSheet({ kind: "card" })} className="border border-slate-300 bg-white text-slate-800">🟨 Kaart</BigButton>
            </div>
          )}

          <Card className="mb-4 !p-3">
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Teller</span>
              <span className="w-[104px] text-center">Wij</span>
              <span className="w-[104px] text-center">Zij</span>
            </div>
            {COUNTERS.map((c) => (
              <div key={c.label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 border-t border-slate-100 py-1.5">
                <span className="truncate text-sm text-slate-700">{c.label}</span>
                <Counter value={m[c.for] ?? 0} onChange={canEdit ? (d) => bumpCounter(c.for, d) : undefined} />
                <Counter value={m[c.against] ?? 0} onChange={canEdit ? (d) => bumpCounter(c.against, d) : undefined} />
              </div>
            ))}
          </Card>

          {(onField.length > 0 || guestsOnField.length > 0) && (
            <Card className="mb-4 !p-3">
              <h2 className="mb-2 text-sm font-semibold">Op het veld ({onField.length + guestsOnField.length})</h2>
              <div className="flex flex-wrap gap-1.5">
                {onField.map((pid) => (
                  <span key={pid} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{playerLabel(playerById(pid))}</span>
                ))}
                {guestsOnField.map((g, i) => (
                  <span key={`g-${i}`} className="rounded-full bg-purple-50 px-2.5 py-1 text-xs text-purple-800">{g?.name} (gast)</span>
                ))}
              </div>
            </Card>
          )}

          {prepNotes && Object.values(prepNotes).some((v) => v.trim()) && (
            <Card className="mb-4 !p-3">
              <button onClick={() => setShowAgreements((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold">
                <span>📋 Afspraken uit de voorbereiding</span>
                <span className="text-slate-400">{showAgreements ? "▲" : "▼"}</span>
              </button>
              {showAgreements && (
                <dl className="mt-2 grid gap-2 text-sm">
                  {OBSERVATION_MOMENTS.filter((mo) => agreementFor(mo.key)).map((mo) => (
                    <div key={mo.key}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{mo.label}</dt>
                      <dd className="whitespace-pre-wrap text-slate-800">{agreementFor(mo.key)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          )}

          <Card className="!p-3">
            <h2 className="mb-1 text-sm font-semibold">Tijdlijn</h2>
            {sorted.length === 0 ? (
              <p className="py-2 text-sm text-slate-500">
                Nog niets vastgelegd. {clock.phase === "pre" ? "Start de wedstrijd bij de aftrap — de klok loopt dan op alle apparaten mee." : ""}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">{[...sorted].reverse().map((e) => eventRow(e))}</ul>
            )}
          </Card>
        </>
      )}

      {tab === "rust" && (
        <>
          <Card className="mb-4">
            <h2 className="mb-1 font-semibold">Rustpraatje</h2>
            <p className="mb-2 text-xs text-slate-500">Max. 3 kernpunten — wat nemen we mee de kleedkamer in?</p>
            <textarea
              className={`${inputCls} w-full`}
              rows={4}
              disabled={!canEdit}
              placeholder={"1. …\n2. …\n3. …"}
              value={drafts.halftime_talk}
              onChange={(e) => updateDraft("halftime_talk", e.target.value)}
              onBlur={(e) => dirty.current.has("halftime_talk") && flushDraft("halftime_talk", e.target.value)}
            />
            {canEdit && !drafts.halftime_talk.trim() && halftimeObs.length > 0 && (
              <button
                onClick={() =>
                  updateDraft(
                    "halftime_talk",
                    halftimeObs
                      .filter((o) => o.sentiment !== "plus")
                      .slice(0, 3)
                      .map((o, i) => `${i + 1}. ${o.note ?? momentLabel(o.moment)}`)
                      .join("\n")
                  )
                }
                className="mt-2 text-xs font-medium text-rose-600 hover:underline"
              >
                ✨ Concept maken uit de verbeterpunten hieronder
              </button>
            )}
          </Card>

          <HalfSummary events={keyEvents.filter((e) => e.half === 1)} describe={describe} halfMinutes={clock.half_minutes} />

          <h2 className="mb-2 mt-6 font-semibold">Afspraak vs. wat zien we</h2>
          {halftimeObs.length === 0 && (
            <p className="mb-3 text-sm text-slate-500">
              Nog geen observaties gemarkeerd voor de rust. Leg ze vast via <strong>📝 Wat zien we?</strong> op het Live-tabblad.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {OBSERVATION_MOMENTS.map((mo) => {
              const obs = halftimeObs.filter((o) => (o.moment ?? "overig") === mo.key);
              const agreement = agreementFor(mo.key);
              if (obs.length === 0 && !agreement) return null;
              return (
                <Card key={mo.key} className="!p-3">
                  <h3 className="mb-1 text-sm font-semibold">{mo.label}</h3>
                  {agreement && (
                    <p className="mb-2 whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                      <span className="font-semibold">Afspraak: </span>
                      {agreement}
                    </p>
                  )}
                  {obs.length === 0 ? (
                    <p className="text-xs text-slate-400">Geen observaties.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">{obs.map((o) => eventRow(o, { flags: false }))}</ul>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {tab === "nabespreking" && (
        <>
          {!hasLiveData && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Deze wedstrijd is niet live gevolgd. Je kunt de nabespreking hieronder wel invullen.
            </p>
          )}

          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <Card className="!p-3">
              <h2 className="mb-1 text-sm font-semibold">Wedstrijdverloop</h2>
              {keyEvents.length === 0 ? (
                <p className="text-sm text-slate-500">Geen goals, wissels of kaarten vastgelegd.</p>
              ) : (
                <ul className="divide-y divide-slate-100">{keyEvents.map((e) => eventRow(e))}</ul>
              )}
            </Card>
            <Card className="!p-3">
              <h2 className="mb-2 text-sm font-semibold">Cijfers</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="py-1 text-left font-medium"></th>
                    <th className="py-1 text-center font-medium">Wij</th>
                    <th className="py-1 text-center font-medium">Zij</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="py-1.5">Doelpunten</td>
                    <td className="py-1.5 text-center font-semibold">{score.for}</td>
                    <td className="py-1.5 text-center font-semibold">{score.against}</td>
                  </tr>
                  {COUNTERS.map((c) => (
                    <tr key={c.label} className="border-t border-slate-100">
                      <td className="py-1.5">{c.label}</td>
                      <td className="py-1.5 text-center">{m[c.for] ?? "–"}</td>
                      <td className="py-1.5 text-center">{m[c.against] ?? "–"}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-100">
                    <td className="py-1.5">Observaties</td>
                    <td className="py-1.5 text-center text-green-700">👍 {observations.filter((o) => o.sentiment === "plus").length}</td>
                    <td className="py-1.5 text-center text-red-700">👎 {observations.filter((o) => o.sentiment === "min").length}</td>
                  </tr>
                </tbody>
              </table>
              {goalsAgainst.length > 0 && (
                <p className="mt-3 text-xs text-slate-600">
                  <span className="font-semibold">Tegengoals ontstaan uit: </span>
                  {Object.entries(
                    goalsAgainst.reduce<Record<string, number>>((acc, g) => {
                      const k = g.moment ? momentLabel(g.moment) : "niet aangegeven";
                      acc[k] = (acc[k] ?? 0) + 1;
                      return acc;
                    }, {})
                  )
                    .map(([k, n]) => `${k} (${n})`)
                    .join(", ")}
                </p>
              )}
            </Card>
          </div>

          <h2 className="mb-2 font-semibold">Observaties per moment</h2>
          {reviewObs.length === 0 ? (
            <p className="mb-4 text-sm text-slate-500">Nog geen observaties gemarkeerd voor de nabespreking.</p>
          ) : (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              {OBSERVATION_MOMENTS.map((mo) => {
                const obs = reviewObs.filter((o) => (o.moment ?? "overig") === mo.key);
                if (obs.length === 0) return null;
                const plus = obs.filter((o) => o.sentiment === "plus");
                const rest = obs.filter((o) => o.sentiment !== "plus");
                return (
                  <Card key={mo.key} className="!p-3">
                    <h3 className="mb-1 text-sm font-semibold">{mo.label}</h3>
                    {agreementFor(mo.key) && (
                      <p className="mb-2 whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                        <span className="font-semibold">Afspraak: </span>
                        {agreementFor(mo.key)}
                      </p>
                    )}
                    {plus.length > 0 && <ul className="divide-y divide-slate-100">{plus.map((o) => eventRow(o, { flags: false }))}</ul>}
                    {rest.length > 0 && <ul className="divide-y divide-slate-100 border-t border-slate-100">{rest.map((o) => eventRow(o, { flags: false }))}</ul>}
                  </Card>
                );
              })}
            </div>
          )}

          <Card className="mb-4">
            <h2 className="mb-3 font-semibold">Conclusies nabespreking</h2>
            {(
              [
                { field: "review_went_well", label: "✅ Wat ging goed — vasthouden", sentiment: "plus" },
                { field: "review_improve", label: "🔧 Wat kan beter", sentiment: "min" },
                { field: "review_training", label: "🏋️ Meenemen naar de training", sentiment: null },
              ] as { field: ReviewField; label: string; sentiment: "plus" | "min" | null }[]
            ).map(({ field, label, sentiment }) => {
              const source = sentiment ? reviewObs.filter((o) => o.sentiment === sentiment) : [];
              return (
                <label key={field} className="mb-4 block text-sm">
                  <span className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">{label}</span>
                    {canEdit && !drafts[field].trim() && source.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft(field, source.map((o) => `- ${o.note ?? momentLabel(o.moment)} (${momentLabel(o.moment)})`).join("\n"))
                        }
                        className="text-xs font-medium text-rose-600 hover:underline"
                      >
                        ✨ Concept uit observaties
                      </button>
                    )}
                  </span>
                  <textarea
                    className={`${inputCls} w-full`}
                    rows={4}
                    disabled={!canEdit}
                    value={drafts[field]}
                    onChange={(e) => updateDraft(field, e.target.value)}
                    onBlur={(e) => dirty.current.has(field) && flushDraft(field, e.target.value)}
                  />
                </label>
              );
            })}
          </Card>

          <MinutesCard
            computed={clock.phase === "ft" ? computeMinutesPlayed(prep, events, clock) : null}
            stats={stats}
            players={players}
            canEdit={canEdit}
            onApply={writeMinutes}
          />

          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/resultaten?match=${m.id}`} className="text-rose-600 hover:underline">
              Beoordelingen, video &amp; AI-advies in Resultaten →
            </Link>
          </div>
        </>
      )}

      {sheet && (
        <EventSheet
          sheet={sheet}
          players={players}
          onField={onField}
          defaultMinute={minuteNow}
          defaultHalf={halfNow}
          halfMinutes={clock.half_minutes}
          phase={clock.phase}
          onClose={() => setSheet(null)}
          onSave={(data) => saveEvent(data, sheet.event)}
          onDelete={sheet.event ? () => deleteEvent(sheet.event!) : undefined}
        />
      )}

      <p className="mt-6 text-center text-xs text-slate-400">
        {formatDate(m.date)} · aftrap {m.kickoff_time} · ververst automatisch elke {POLL_MS / 1000} s
      </p>
    </div>
  );
}

function kindForEvent(e: MatchEvent): SheetKind {
  if (e.type === "card_yellow" || e.type === "card_red") return "card";
  return e.type as SheetKind;
}

function BigButton({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className: string }) {
  return (
    <button onClick={onClick} className={`min-h-14 rounded-xl px-3 py-3 text-base font-semibold shadow-sm active:scale-[0.98] ${className}`}>
      {children}
    </button>
  );
}

function Counter({ value, onChange }: { value: number; onChange?: (delta: number) => void }) {
  return (
    <div className="flex w-[104px] items-center justify-between">
      {onChange ? (
        <button onClick={() => onChange(-1)} className="h-9 w-9 rounded-lg border border-slate-200 text-lg text-slate-500 active:bg-slate-100" aria-label="min 1">−</button>
      ) : (
        <span className="w-9" />
      )}
      <span className="w-8 text-center font-mono text-lg font-semibold tabular-nums">{value}</span>
      {onChange ? (
        <button onClick={() => onChange(1)} className="h-9 w-9 rounded-lg bg-slate-900 text-lg text-white active:bg-slate-700" aria-label="plus 1">+</button>
      ) : (
        <span className="w-9" />
      )}
    </div>
  );
}

function FlagChip({ on, label, onClick }: { on: boolean; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${on ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400 line-through"}`}
    >
      {label}
    </button>
  );
}

function HalfSummary({ events, describe, halfMinutes }: { events: MatchEvent[]; describe: (e: MatchEvent) => string; halfMinutes: number }) {
  if (events.length === 0) return null;
  return (
    <Card className="!p-3">
      <h2 className="mb-1 text-sm font-semibold">1e helft in het kort</h2>
      <ul className="text-sm">
        {events.map((e) => (
          <li key={e.id} className="py-0.5">
            <span className="mr-2 font-mono text-xs text-slate-500">{formatMinute(e.minute, e.half, halfMinutes)}</span>
            {EVENT_ICON[e.type]} {describe(e)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MinutesCard({
  computed,
  stats,
  players,
  canEdit,
  onApply,
}: {
  computed: Record<string, number> | null;
  stats: MatchStat[];
  players: Player[];
  canEdit: boolean;
  onApply: (minutes: Record<string, number>) => void;
}) {
  if (!computed || Object.keys(computed).length === 0) return null;
  const rows = Object.entries(computed)
    .map(([pid, min]) => ({ player: players.find((p) => p.id === pid), pid, min, current: stats.find((s) => s.player_id === pid)?.minutes_played ?? 0 }))
    .sort((a, b) => b.min - a.min);
  const allMatch = rows.every((r) => r.current === r.min);
  return (
    <Card className="mb-4 !p-3">
      <h2 className="mb-1 text-sm font-semibold">Speelminuten</h2>
      <p className="mb-2 text-xs text-slate-500">Berekend uit de basisopstelling, de wissels en de werkelijke speeltijd per helft.</p>
      <table className="mb-3 w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="py-1 text-left font-medium">Speler</th>
            <th className="py-1 text-right font-medium">Berekend</th>
            <th className="py-1 text-right font-medium">Nu in statistieken</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pid} className="border-t border-slate-100">
              <td className="py-1">{playerLabel(r.player)}</td>
              <td className="py-1 text-right font-mono">{r.min}&apos;</td>
              <td className={`py-1 text-right font-mono ${r.current === r.min ? "text-green-700" : "text-slate-400"}`}>{r.current || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit &&
        (allMatch ? (
          <Badge color="green">✓ Staat in de statistieken</Badge>
        ) : (
          <button onClick={() => onApply(computed)} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
            Zet speelminuten in statistieken
          </button>
        ))}
    </Card>
  );
}

// ---------- invoerscherm (bottom sheet) voor goals, wissels, kaarten en observaties ----------

function EventSheet({
  sheet,
  players,
  onField,
  defaultMinute,
  defaultHalf,
  halfMinutes,
  phase,
  onClose,
  onSave,
  onDelete,
}: {
  sheet: Sheet;
  players: Player[];
  onField: string[];
  defaultMinute: number;
  defaultHalf: 1 | 2;
  halfMinutes: number;
  phase: LiveClock["phase"];
  onClose: () => void;
  onSave: (data: Omit<MatchEvent, "id" | "match_id" | "created_at" | "created_by_name">) => void;
  onDelete?: () => void;
}) {
  const e = sheet.event;
  const kind = sheet.kind;
  const [minute, setMinute] = useState(String(e?.minute ?? Math.max(defaultMinute, 0)));
  const [half, setHalf] = useState<1 | 2>(e?.half ?? defaultHalf);
  const [playerId, setPlayerId] = useState<string | null>(e?.player_id ?? null);
  const [relatedId, setRelatedId] = useState<string | null>(e?.related_player_id ?? null);
  const [moment, setMoment] = useState<ObservationMoment | null>(e?.moment ?? null);
  const [sentiment, setSentiment] = useState<"plus" | "min" | null>(e?.sentiment ?? null);
  const [note, setNote] = useState(e?.note ?? "");
  const [cardRed, setCardRed] = useState(e?.type === "card_red");
  const [forHalftime, setForHalftime] = useState(e?.for_halftime ?? (phase === "pre" || phase === "h1" || phase === "ht"));
  const [forReview, setForReview] = useState(e?.for_review ?? true);
  const [busy, setBusy] = useState(false);

  // Escape sluit het scherm (laptop); body-scroll blokkeren (telefoon).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const onFieldPlayers = onField.map((id) => players.find((p) => p.id === id)).filter(Boolean) as Player[];
  const benchPlayers = players.filter((p) => !onField.includes(p.id));
  const hasLineup = onFieldPlayers.length > 0;

  const title = {
    goal_for: "⚽ Goal wij",
    goal_against: "🥅 Goal tegen",
    substitution: "🔁 Wissel",
    card: "🟨 Kaart",
    observation: "📝 Wat zien we?",
  }[kind];

  const canSave =
    !busy &&
    (kind === "observation"
      ? note.trim().length > 0
      : kind === "substitution"
        ? !!playerId && !!relatedId && playerId !== relatedId
        : kind === "card"
          ? !!playerId
          : true);

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    const type: MatchEventType = kind === "card" ? (cardRed ? "card_red" : "card_yellow") : kind;
    const isObs = kind === "observation";
    const isGoalAgainst = kind === "goal_against";
    onSave({
      type,
      half,
      minute: Math.max(0, parseInt(minute, 10) || 0),
      player_id: kind === "goal_against" ? null : playerId,
      related_player_id: kind === "goal_for" || kind === "substitution" ? relatedId : null,
      moment: isObs || isGoalAgainst ? moment : null,
      sentiment: isObs ? sentiment : null,
      note: note.trim() || null,
      for_halftime: isObs ? forHalftime : false,
      for_review: isObs || isGoalAgainst ? forReview : false,
    });
  }

  function addPhrase(phrase: string) {
    setNote((prev) => (prev.trim() ? `${prev.trim()}. ${phrase}` : phrase));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-lg font-semibold">{e ? `${title} — bewerken` : title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label="Sluiten">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {kind === "observation" && (
            <>
              <Section label="Moment">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {OBSERVATION_MOMENTS.map((mo) => (
                    <Chip key={mo.key} on={moment === mo.key} onClick={() => setMoment(moment === mo.key ? null : mo.key)}>
                      {mo.label}
                    </Chip>
                  ))}
                </div>
              </Section>
              <Section label="Goed of verbeterpunt?">
                <div className="grid grid-cols-2 gap-1.5">
                  <Chip on={sentiment === "plus"} onClick={() => setSentiment(sentiment === "plus" ? null : "plus")} tone="green">👍 Gaat goed</Chip>
                  <Chip on={sentiment === "min"} onClick={() => setSentiment(sentiment === "min" ? null : "min")} tone="red">👎 Moet beter</Chip>
                </div>
              </Section>
              <Section label="Wat zie je?">
                <textarea
                  autoFocus={!e}
                  className={`${inputCls} w-full`}
                  rows={3}
                  placeholder="Kort en concreet — tip: gebruik de microfoon van je toetsenbord"
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_PHRASES[moment ?? "overig"].map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      onClick={() => addPhrase(ph)}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 active:bg-slate-100"
                    >
                      + {ph}
                    </button>
                  ))}
                </div>
              </Section>
              <Section label="Speler (optioneel)">
                <PlayerPicker primary={hasLineup ? onFieldPlayers : players} secondary={hasLineup ? benchPlayers : []} selected={playerId} onSelect={setPlayerId} allowNone />
              </Section>
              <Section label="Meenemen naar">
                <div className="grid grid-cols-2 gap-1.5">
                  <Chip on={forHalftime} onClick={() => setForHalftime((v) => !v)}>📣 Rust</Chip>
                  <Chip on={forReview} onClick={() => setForReview((v) => !v)}>📋 Nabespreking</Chip>
                </div>
              </Section>
            </>
          )}

          {kind === "goal_for" && (
            <>
              <Section label="Doelpuntenmaker">
                <PlayerPicker primary={hasLineup ? onFieldPlayers : players} secondary={hasLineup ? benchPlayers : []} selected={playerId} onSelect={setPlayerId} allowNone noneLabel="Onbekend / eigen goal" />
              </Section>
              <Section label="Assist">
                <PlayerPicker
                  primary={(hasLineup ? onFieldPlayers : players).filter((p) => p.id !== playerId)}
                  secondary={hasLineup ? benchPlayers.filter((p) => p.id !== playerId) : []}
                  selected={relatedId}
                  onSelect={setRelatedId}
                  allowNone
                  noneLabel="Geen assist"
                />
              </Section>
            </>
          )}

          {kind === "goal_against" && (
            <Section label="Ontstaan uit (voor de analyse)">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {OBSERVATION_MOMENTS.map((mo) => (
                  <Chip key={mo.key} on={moment === mo.key} onClick={() => setMoment(moment === mo.key ? null : mo.key)}>
                    {mo.label}
                  </Chip>
                ))}
              </div>
            </Section>
          )}

          {kind === "substitution" && (
            <>
              <Section label="Eruit">
                <PlayerPicker primary={hasLineup ? onFieldPlayers : players} secondary={[]} selected={relatedId} onSelect={setRelatedId} />
              </Section>
              <Section label="Erin">
                <PlayerPicker primary={hasLineup ? benchPlayers : players.filter((p) => p.id !== relatedId)} secondary={[]} selected={playerId} onSelect={setPlayerId} />
              </Section>
            </>
          )}

          {kind === "card" && (
            <>
              <Section label="Kaart">
                <div className="grid grid-cols-2 gap-1.5">
                  <Chip on={!cardRed} onClick={() => setCardRed(false)}>🟨 Geel</Chip>
                  <Chip on={cardRed} onClick={() => setCardRed(true)} tone="red">🟥 Rood</Chip>
                </div>
              </Section>
              <Section label="Speler">
                <PlayerPicker primary={hasLineup ? onFieldPlayers : players} secondary={hasLineup ? benchPlayers : []} selected={playerId} onSelect={setPlayerId} />
              </Section>
            </>
          )}

          {kind !== "observation" && (
            <Section label="Toelichting (optioneel)">
              <input
                className={`${inputCls} w-full`}
                placeholder={kind === "goal_against" ? "Hoe ontstond de tegengoal?" : kind === "goal_for" ? "Bv. uit een corner, na omschakeling…" : ""}
                value={note}
                onChange={(ev) => setNote(ev.target.value)}
              />
            </Section>
          )}

          <Section label="Minuut">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMinute(String(Math.max(0, (parseInt(minute, 10) || 0) - 1)))} className="h-10 w-10 rounded-lg border border-slate-200 text-lg">−</button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className={`${inputCls} w-20 text-center`}
                value={minute}
                onChange={(ev) => setMinute(ev.target.value)}
              />
              <button type="button" onClick={() => setMinute(String((parseInt(minute, 10) || 0) + 1))} className="h-10 w-10 rounded-lg border border-slate-200 text-lg">+</button>
              <div className="ml-auto grid grid-cols-2 gap-1">
                <Chip on={half === 1} onClick={() => setHalf(1)}>1e</Chip>
                <Chip on={half === 2} onClick={() => setHalf(2)}>2e</Chip>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-400">Wordt weergegeven als {formatMinute(parseInt(minute, 10) || 0, half, halfMinutes)}</p>
          </Section>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {onDelete && (
            <button onClick={onDelete} className="rounded-lg border border-red-200 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">
              Verwijderen
            </button>
          )}
          <button
            onClick={submit}
            disabled={!canSave}
            className="flex-1 rounded-lg bg-rose-600 px-4 py-2.5 text-base font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
  tone = "rose",
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "rose" | "green" | "red";
}) {
  const active = { rose: "border-rose-600 bg-rose-600 text-white", green: "border-green-600 bg-green-600 text-white", red: "border-red-600 bg-red-600 text-white" }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-lg border px-2.5 py-2 text-sm font-medium ${on ? active : "border-slate-300 bg-white text-slate-700"}`}
    >
      {children}
    </button>
  );
}

function PlayerPicker({
  primary,
  secondary,
  selected,
  onSelect,
  allowNone,
  noneLabel = "Geen",
}: {
  primary: Player[];
  secondary: Player[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const [showAll, setShowAll] = useState(!!selected && secondary.some((p) => p.id === selected));
  const btn = (p: Player) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onSelect(selected === p.id ? null : p.id)}
      className={`min-h-10 rounded-lg border px-2 py-1.5 text-left text-sm ${
        selected === p.id ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 bg-white text-slate-700"
      }`}
    >
      {p.shirt_number ? <span className="mr-1 font-mono text-xs opacity-70">#{p.shirt_number}</span> : null}
      {firstName(p)}
      <span className="hidden sm:inline"> {p.name.split(" ").slice(1).join(" ")}</span>
    </button>
  );
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {allowNone && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`min-h-10 rounded-lg border px-2 py-1.5 text-sm ${selected === null ? "border-slate-700 bg-slate-700 text-white" : "border-dashed border-slate-300 text-slate-500"}`}
          >
            {noneLabel}
          </button>
        )}
        {primary.map(btn)}
      </div>
      {secondary.length > 0 && (
        <>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-medium text-rose-600">
            {showAll ? "▲ Verberg wisselspelers" : `▼ Wisselspelers / overige (${secondary.length})`}
          </button>
          {showAll && <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4">{secondary.map(btn)}</div>}
        </>
      )}
    </div>
  );
}
