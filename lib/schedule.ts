import {
  ARRIVE_MINUTES_BEFORE_KICKOFF,
  Club,
  Match,
  PLAYERS_PER_CAR,
  Player,
  ScheduleItem,
} from "./types";

// ---------- Tijdberekeningen ----------

export function parseTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function minutesToTime(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const mm = t % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export type MatchTimes = {
  arrive: string | null; // aanwezig op wedstrijdlocatie
  depart: string | null; // vertrek vanaf eigen sportpark (alleen uit)
  travelMinutes: number | null;
};

/**
 * Aanwezig = aftrap − 60 min (op de locatie waar gespeeld wordt).
 * Bij uitwedstrijden: vertrek = aanwezig − reistijd naar de tegenstander.
 */
export function computeMatchTimes(match: Match, clubs: Club[]): MatchTimes {
  const kickoff = parseTimeToMinutes(match.kickoff_time);
  if (kickoff === null) return { arrive: null, depart: null, travelMinutes: null };

  const arrive = kickoff - ARRIVE_MINUTES_BEFORE_KICKOFF;
  if (match.home_away === "home") {
    return { arrive: minutesToTime(arrive), depart: null, travelMinutes: null };
  }

  const club = clubs.find(
    (c) => c.name.trim().toLowerCase() === match.opponent.trim().toLowerCase()
  );
  const travel = club?.travel_time_minutes ?? null;
  return {
    arrive: minutesToTime(arrive),
    depart: travel !== null ? minutesToTime(arrive - travel) : null,
    travelMinutes: travel,
  };
}

/**
 * Zelfde regel als bij wedstrijden, maar dan voor een seizoensplanning-item:
 * aanwezig = aftrap − 60 min op de speellocatie; vertrek = aanwezig − reistijd
 * vanaf Sportpark Sv Steenwijkerwold (alleen bij "away", thuis is reistijd 0).
 */
export function computeScheduleItemTimes(item: ScheduleItem): MatchTimes {
  if (!item.kickoff_time) return { arrive: null, depart: null, travelMinutes: null };
  const kickoff = parseTimeToMinutes(item.kickoff_time);
  if (kickoff === null) return { arrive: null, depart: null, travelMinutes: null };

  const arrive = kickoff - ARRIVE_MINUTES_BEFORE_KICKOFF;
  if (item.home_away !== "away") {
    return { arrive: minutesToTime(arrive), depart: null, travelMinutes: null };
  }

  const travel = item.travel_time_minutes;
  return {
    arrive: minutesToTime(arrive),
    depart: travel !== null ? minutesToTime(arrive - travel) : null,
    travelMinutes: travel,
  };
}

// ---------- Rotatie (was- en rijschema) ----------

export function carsNeeded(activePlayerCount: number): number {
  return Math.ceil(activePlayerCount / PLAYERS_PER_CAR);
}

export type GeneratedSchedule = {
  wash: { match_id: string; player_id: string }[];
  carpool: { match_id: string; player_id: string }[];
};

type ExistingDuty = { match_id: string; player_id: string };

// Kiest de actieve speler met de minste beurten tot nu toe. Bij gelijke stand
// wordt round-robin verder gerold vanaf `pointer` (zelfde volgorde als een
// verse generatie zonder bestaande data — counts beginnen dan allemaal op 0).
function pickLeastLoaded(
  active: Player[],
  counts: Map<string, number>,
  pointer: number,
  exclude: Set<string>
): { id: string; nextPointer: number } {
  const candidates = active.filter((p) => !exclude.has(p.id));
  const minCount = Math.min(...candidates.map((p) => counts.get(p.id) ?? 0));
  for (let i = 0; i < active.length; i++) {
    const idx = (pointer + i) % active.length;
    const p = active[idx];
    if (exclude.has(p.id)) continue;
    if ((counts.get(p.id) ?? 0) === minCount) {
      return { id: p.id, nextPointer: idx + 1 };
    }
  }
  return { id: candidates[0].id, nextPointer: pointer };
}

/**
 * Vult het was- en rijschema aan voor wedstrijden die nog geen beurt hebben —
 * bestaande toewijzingen (`existingWash`/`existingCarpool`) blijven onaangeroerd
 * en tellen mee in de eerlijkheidsverdeling, zodat het toevoegen van nieuwe
 * wedstrijden en opnieuw genereren de al ingeplande spelers niet verschuift.
 * - Wasbeurt: 1 speler per wedstrijd (thuis én uit).
 * - Rijbeurt: alleen uitwedstrijden, ceil(spelers/4) rijders per wedstrijd.
 * Was- en rijrotatie lopen onafhankelijk van elkaar door. Zonder bestaande
 * data (verse generatie) is dit gelijk aan de oude round-robin-volgorde.
 */
export function generateSchedule(
  players: Player[],
  matches: Match[],
  existingWash: ExistingDuty[] = [],
  existingCarpool: ExistingDuty[] = []
): GeneratedSchedule {
  const active = players
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const sortedMatches = [...matches].sort((a, b) =>
    `${a.date} ${a.kickoff_time}`.localeCompare(`${b.date} ${b.kickoff_time}`)
  );

  const wash: GeneratedSchedule["wash"] = [];
  const carpool: GeneratedSchedule["carpool"] = [];
  if (active.length === 0) return { wash, carpool };

  const existingWashMatchIds = new Set(existingWash.map((w) => w.match_id));
  const existingCarpoolMatchIds = new Set(existingCarpool.map((c) => c.match_id));

  const washCounts = new Map<string, number>(active.map((p) => [p.id, 0]));
  existingWash.forEach((w) => washCounts.has(w.player_id) && washCounts.set(w.player_id, washCounts.get(w.player_id)! + 1));
  const carCounts = new Map<string, number>(active.map((p) => [p.id, 0]));
  existingCarpool.forEach((c) => carCounts.has(c.player_id) && carCounts.set(c.player_id, carCounts.get(c.player_id)! + 1));

  let washPointer = 0;
  let carPointer = 0;

  for (const match of sortedMatches) {
    if (!existingWashMatchIds.has(match.id)) {
      const { id, nextPointer } = pickLeastLoaded(active, washCounts, washPointer, new Set());
      wash.push({ match_id: match.id, player_id: id });
      washCounts.set(id, (washCounts.get(id) ?? 0) + 1);
      washPointer = nextPointer;
    }

    if (match.home_away === "away" && !existingCarpoolMatchIds.has(match.id)) {
      const cars = carsNeeded(active.length);
      const chosen = new Set<string>();
      for (let c = 0; c < cars; c++) {
        const { id, nextPointer } = pickLeastLoaded(active, carCounts, carPointer, chosen);
        carpool.push({ match_id: match.id, player_id: id });
        carCounts.set(id, (carCounts.get(id) ?? 0) + 1);
        carPointer = nextPointer;
        chosen.add(id);
      }
    }
  }

  return { wash, carpool };
}
