import {
  Absence,
  ARRIVE_MINUTES_BEFORE_KICKOFF,
  Club,
  Match,
  PLAYERS_PER_CAR,
  Player,
  ScheduleItem,
} from "./types";
import { isTrainingActivity } from "./training";

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
// `avoid` is een zachte uitsluiting (bv. bekende afwezigheid): wordt gebruikt
// als er nog kandidaten buiten die groep over zijn, anders genegeerd.
function pickLeastLoaded(
  active: Player[],
  counts: Map<string, number>,
  pointer: number,
  exclude: Set<string>,
  avoid: Set<string> = new Set()
): { id: string; nextPointer: number } {
  const withoutExcluded = active.filter((p) => !exclude.has(p.id));
  const preferred = withoutExcluded.filter((p) => !avoid.has(p.id));
  const candidates = preferred.length > 0 ? preferred : withoutExcluded;
  const minCount = Math.min(...candidates.map((p) => counts.get(p.id) ?? 0));
  for (let i = 0; i < active.length; i++) {
    const idx = (pointer + i) % active.length;
    const p = active[idx];
    if (!candidates.includes(p)) continue;
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

// ---------- Rotatie (corvee) ----------

function addDaysLocal(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Maandag van de week waarin `dateIso` valt — corvee loopt per week, niet per
// wedstrijd/training, dus alle rijen delen dezelfde week_start.
export function mondayOfWeek(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`);
  const dayNr = (d.getDay() + 6) % 7; // maandag = 0
  return addDaysLocal(dateIso, -dayNr);
}

export const CORVEE_TEAM_SIZE = 3;

export type GeneratedCorvee = { week_start: string; player_id: string }[];

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Vult corvee aan voor elke week vanaf de huidige week (voorgaande weken
 * tellen niet mee — dat is al gebeurd, corvee is niet met terugwerkende
 * kracht) met minstens één training die nog geen corvee heeft. Vier regels:
 * 1. Wie die week de wasbeurt heeft (voor een wedstrijd in diezelfde week)
 *    hoort altijd ook bij de corveeploeg — bij meerdere wedstrijden in
 *    dezelfde week (dus meerdere wasbeurt-spelers) tellen ze allemaal mee.
 * 2. Spelers met een bekende afwezigheid die week worden zoveel mogelijk
 *    overgeslagen (niet hard uitgesloten: als er te weinig beschikbare
 *    spelers overblijven, telt de eerlijke verdeling zwaarder dan dat).
 * 3. Eerlijk verdeeld over het seizoen (zelfde least-loaded-rotatie als
 *    was/rijden).
 * 4. Bij voorkeur niet twee weken achter elkaar dezelfde speler — wie er
 *    vorige week al bij zat, wordt deze week zoveel mogelijk overgeslagen
 *    (net als bij afwezigheid: zachte voorkeur, geen harde uitsluiting).
 */
export function generateCorveeSchedule(
  players: Player[],
  scheduleItems: ScheduleItem[],
  matches: Match[],
  washDuty: { match_id: string; player_id: string }[],
  absences: Absence[],
  existingCorvee: { week_start: string; player_id: string }[] = [],
  today: string = todayIsoLocal()
): GeneratedCorvee {
  const active = players
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  if (active.length === 0) return [];

  const currentWeek = mondayOfWeek(today);
  const trainingWeeks = [
    ...new Set(scheduleItems.filter((s) => isTrainingActivity(s.activity)).map((s) => mondayOfWeek(s.date))),
  ]
    .filter((w) => w >= currentWeek)
    .sort();

  const existingWeeks = new Set(existingCorvee.map((c) => c.week_start));
  const existingByWeek = new Map<string, string[]>();
  existingCorvee.forEach((c) => existingByWeek.set(c.week_start, [...(existingByWeek.get(c.week_start) ?? []), c.player_id]));
  const counts = new Map<string, number>(active.map((p) => [p.id, 0]));
  existingCorvee.forEach((c) => counts.has(c.player_id) && counts.set(c.player_id, counts.get(c.player_id)! + 1));
  const activeIds = new Set(active.map((p) => p.id));
  let pointer = 0;

  // Wie zat er in de week vlak vóór de eerste te vullen week? (Voor regel 4.)
  let previousWeekPlayerIds = new Set<string>(
    trainingWeeks.length > 0 ? existingByWeek.get(addDaysLocal(trainingWeeks[0], -7)) ?? [] : []
  );

  const result: GeneratedCorvee = [];

  for (const weekStart of trainingWeeks) {
    if (existingWeeks.has(weekStart)) {
      // Al ingevuld (bv. handmatig aangepast) — telt wel mee als "vorige week" voor de rotatie hierna.
      previousWeekPlayerIds = new Set(existingByWeek.get(weekStart) ?? []);
      continue;
    }
    const weekEnd = addDaysLocal(weekStart, 6);

    const absentPlayerIds = new Set(
      absences
        .filter((a) => a.player_id && a.from <= weekEnd && a.until >= weekStart)
        .map((a) => a.player_id as string)
    );

    // Regel 1: iedereen met wasbeurt voor een wedstrijd deze week hoort erbij.
    const matchIdsInWeek = new Set(matches.filter((m) => m.date >= weekStart && m.date <= weekEnd).map((m) => m.id));
    const preferredIds = washDuty.filter((w) => matchIdsInWeek.has(w.match_id)).map((w) => w.player_id);

    const chosen = new Set<string>();
    for (const id of preferredIds) {
      if (activeIds.has(id) && !absentPlayerIds.has(id)) chosen.add(id);
    }

    // Regel 2 + 4 samen als "zachte" voorkeur bij het aanvullen: eerst iemand
    // die niet afwezig is én niet vorige week al aan de beurt was; pas als dat
    // niemand overlaat, telt de eerlijke verdeling (regel 3) zwaarder.
    const avoid = new Set<string>([...absentPlayerIds, ...previousWeekPlayerIds]);
    while (chosen.size < CORVEE_TEAM_SIZE && chosen.size < active.length) {
      const { id, nextPointer } = pickLeastLoaded(active, counts, pointer, chosen, avoid);
      chosen.add(id);
      pointer = nextPointer;
    }

    for (const id of chosen) {
      result.push({ week_start: weekStart, player_id: id });
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    previousWeekPlayerIds = chosen;
  }

  return result;
}
