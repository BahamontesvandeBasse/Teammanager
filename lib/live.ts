import { LiveClock, MatchEvent, MatchPreparation, ObservationMoment } from "@/lib/types";

// Rekenlogica voor de live-wedstrijdmodus: klok, voetbalminuten en
// speelminuten op basis van basisopstelling + wissels. Puur (geen React/IO),
// zodat het ook vanuit scripts/test-logic.ts te testen is.

export const DEFAULT_HALF_MINUTES = 45;

export function emptyClock(halfMinutes = DEFAULT_HALF_MINUTES): LiveClock {
  return { phase: "pre", half_minutes: halfMinutes, h1_start: null, h1_end: null, h2_start: null, h2_end: null };
}

export const OBSERVATION_MOMENTS: { key: ObservationMoment; label: string; short: string }[] = [
  { key: "attacking", label: "Aanvallen", short: "Aanv." },
  { key: "defending", label: "Verdedigen", short: "Verd." },
  { key: "transition_to_attack", label: "Omschakelen → aanval", short: "Omsch. →A" },
  { key: "transition_to_defense", label: "Omschakelen → verdedigen", short: "Omsch. →V" },
  { key: "standaard", label: "Standaardsituaties", short: "Standaard" },
  { key: "overig", label: "Overig (mentaal, coaching…)", short: "Overig" },
];

export function momentLabel(m: ObservationMoment | null): string {
  return OBSERVATION_MOMENTS.find((x) => x.key === m)?.label ?? "Overig";
}

/** Verstreken milliseconden in de lopende helft (0 als er geen helft loopt). */
export function elapsedMs(clock: LiveClock, now: number): number {
  if (clock.phase === "h1" && clock.h1_start) return Math.max(0, now - Date.parse(clock.h1_start));
  if (clock.phase === "h2" && clock.h2_start) return Math.max(0, now - Date.parse(clock.h2_start));
  return 0;
}

/** Huidige helft voor het vastleggen van een moment (rust telt als einde 1e helft). */
export function currentHalf(clock: LiveClock): 1 | 2 {
  return clock.phase === "h2" || clock.phase === "ft" ? 2 : 1;
}

/**
 * Doorlopende voetbalminuut zoals een scheidsrechter die telt: 0:30 gespeeld is
 * de 1e minuut; de 2e helft begint bij half_minutes + 1. Tijdens rust/einde
 * geeft dit de laatste minuut van de afgelopen helft.
 */
export function currentMinute(clock: LiveClock, now: number): number {
  const half = clock.half_minutes;
  if (clock.phase === "pre") return 0;
  if (clock.phase === "h1") return Math.floor(elapsedMs(clock, now) / 60000) + 1;
  if (clock.phase === "h2") return half + Math.floor(elapsedMs(clock, now) / 60000) + 1;
  if (clock.phase === "ht") return halfLengthMinutes(clock, 1) ?? half;
  return half + (halfLengthMinutes(clock, 2) ?? half);
}

/** "45+2'" i.p.v. "47'" voor minuten in blessuretijd. */
export function formatMinute(minute: number, half: 1 | 2, halfMinutes: number): string {
  if (minute <= 0) return "–";
  const regularEnd = half === 1 ? halfMinutes : halfMinutes * 2;
  return minute > regularEnd ? `${regularEnd}+${minute - regularEnd}'` : `${minute}'`;
}

/** Klokweergave "mm:ss" van de lopende helft, doorlopend (2e helft vanaf 45:00). */
export function formatClock(clock: LiveClock, now: number): string {
  const offset = clock.phase === "h2" ? clock.half_minutes * 60 : 0;
  const total = Math.floor(elapsedMs(clock, now) / 1000) + offset;
  if (clock.phase === "ht") return `${clock.half_minutes}:00`;
  if (clock.phase === "ft") return `${clock.half_minutes * 2}:00`;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Werkelijk gespeelde minuten van een afgeronde helft (incl. blessuretijd), afgerond. */
export function halfLengthMinutes(clock: LiveClock, half: 1 | 2): number | null {
  const start = half === 1 ? clock.h1_start : clock.h2_start;
  const end = half === 1 ? clock.h1_end : clock.h2_end;
  if (!start || !end) return null;
  return Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 60000));
}

export function phaseLabel(clock: LiveClock): string {
  return { pre: "Nog niet begonnen", h1: "1e helft", ht: "Rust", h2: "2e helft", ft: "Afgelopen" }[clock.phase];
}

export function scoreFromEvents(events: MatchEvent[]): { for: number; against: number } {
  return {
    for: events.filter((e) => e.type === "goal_for").length,
    against: events.filter((e) => e.type === "goal_against").length,
  };
}

export function sortEvents(events: MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => a.minute - b.minute || a.created_at.localeCompare(b.created_at));
}

/** Basisspelers (alleen echte spelers, geen gasten) uit de wedstrijdvoorbereiding. */
export function startingPlayerIds(prep: MatchPreparation | undefined): string[] {
  return (prep?.lineup ?? []).map((l) => l.player_id).filter((id): id is string => !!id);
}

/** Wie staat er nu op het veld, gegeven de basis en de wissels tot nu toe. */
export function onFieldPlayerIds(prep: MatchPreparation | undefined, events: MatchEvent[]): string[] {
  const onField = new Set(startingPlayerIds(prep));
  for (const e of sortEvents(events)) {
    if (e.type !== "substitution") continue;
    if (e.related_player_id) onField.delete(e.related_player_id);
    if (e.player_id) onField.add(e.player_id);
  }
  return [...onField];
}

/**
 * Speelminuten per speler op basis van basisopstelling en wissels. Gebruikt de
 * werkelijke lengte van beide helften als de klok die kent, anders de
 * nominale speelduur. Een wissel in minuut m betekent: eruit na m−1 minuten
 * gespeeld (afgerond op hele minuten — precies genoeg voor de belasting).
 */
export function computeMinutesPlayed(
  prep: MatchPreparation | undefined,
  events: MatchEvent[],
  clock: LiveClock
): Record<string, number> {
  const half = clock.half_minutes;
  const h1 = halfLengthMinutes(clock, 1) ?? half;
  const h2 = halfLengthMinutes(clock, 2) ?? half;
  const total = h1 + h2;

  // Wisselminuut omrekenen naar "minuten gespeeld sinds aftrap", rekening
  // houdend met een eventueel langere/kortere 1e helft dan nominaal.
  const toElapsed = (e: MatchEvent) =>
    e.half === 1 ? Math.min(Math.max(e.minute - 1, 0), h1) : h1 + Math.min(Math.max(e.minute - half - 1, 0), h2);

  const onSince = new Map<string, number>();
  const result: Record<string, number> = {};
  for (const id of startingPlayerIds(prep)) onSince.set(id, 0);

  for (const e of sortEvents(events)) {
    if (e.type !== "substitution") continue;
    const t = toElapsed(e);
    if (e.related_player_id && onSince.has(e.related_player_id)) {
      const from = onSince.get(e.related_player_id)!;
      result[e.related_player_id] = (result[e.related_player_id] ?? 0) + Math.max(0, t - from);
      onSince.delete(e.related_player_id);
    }
    if (e.player_id && !onSince.has(e.player_id)) onSince.set(e.player_id, t);
  }
  for (const [id, from] of onSince) result[id] = (result[id] ?? 0) + Math.max(0, total - from);
  return result;
}
