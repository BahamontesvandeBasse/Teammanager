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

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Spelers met een afwezigheid die (deels) overlapt met [from, until].
function absentPlayerIdsBetween(absences: Absence[], from: string, until: string): Set<string> {
  return new Set(
    absences
      .filter((a) => a.player_id && a.from <= until && a.until >= from)
      .map((a) => a.player_id as string)
  );
}

export type GeneratedSchedule = {
  wash: { match_id: string; player_id: string }[];
  carpool: { match_id: string; player_id: string }[];
  // Bestaande beurten (ids) die weg moeten omdat de speler afwezig is.
  removeWashIds: string[];
  removeCarpoolIds: string[];
};

type ExistingDuty = { id?: string; match_id: string; player_id: string };

// Kiest de actieve speler met de minste beurten tot nu toe. Bij gelijke stand
// wordt round-robin verder gerold vanaf `pointer` (zelfde volgorde als een
// verse generatie zonder bestaande data — counts beginnen dan allemaal op 0).
// `exclude` is hard (al gekozen, afwezig); `avoid` is een zachte uitsluiting
// (bv. vorige week al corvee): wordt gebruikt als er nog kandidaten buiten die
// groep over zijn, anders genegeerd. Geeft null als niemand beschikbaar is.
function pickLeastLoaded(
  active: Player[],
  counts: Map<string, number>,
  pointer: number,
  exclude: Set<string>,
  avoid: Set<string> = new Set()
): { id: string; nextPointer: number } | null {
  const withoutExcluded = active.filter((p) => !exclude.has(p.id));
  if (withoutExcluded.length === 0) return null;
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
 * Vult het was- en rijschema aan voor wedstrijden die nog geen (volledige)
 * beurt hebben — bestaande toewijzingen blijven staan en tellen mee in de
 * eerlijkheidsverdeling, zodat het toevoegen van nieuwe wedstrijden en opnieuw
 * genereren de al ingeplande spelers niet verschuift.
 * - Wasbeurt: 1 speler per wedstrijd (thuis én uit).
 * - Rijbeurt: alleen uitwedstrijden, ceil(spelers/4) rijders per wedstrijd.
 * - Afwezig is hard: wie op de wedstrijddatum afwezig staat wordt nooit
 *   ingepland. Bestaande beurten vanaf vandaag van een (inmiddels) afwezige
 *   speler worden verwijderd en opnieuw ingevuld.
 * Was- en rijrotatie lopen onafhankelijk van elkaar door. Zonder bestaande
 * data (verse generatie) is dit gelijk aan de oude round-robin-volgorde.
 */
export function generateSchedule(
  players: Player[],
  matches: Match[],
  existingWash: ExistingDuty[] = [],
  existingCarpool: ExistingDuty[] = [],
  absences: Absence[] = [],
  today: string = todayIsoLocal()
): GeneratedSchedule {
  const active = players
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const sortedMatches = [...matches].sort((a, b) =>
    `${a.date} ${a.kickoff_time}`.localeCompare(`${b.date} ${b.kickoff_time}`)
  );

  const result: GeneratedSchedule = { wash: [], carpool: [], removeWashIds: [], removeCarpoolIds: [] };
  if (active.length === 0) return result;

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const absentOn = (date: string) => absentPlayerIdsBetween(absences, date, date);
  const isAbsentFutureDuty = (d: ExistingDuty) => {
    const m = matchById.get(d.match_id);
    return !!m && m.date >= today && absentOn(m.date).has(d.player_id);
  };

  const keptWash: ExistingDuty[] = [];
  existingWash.forEach((w) => (isAbsentFutureDuty(w) && w.id ? result.removeWashIds.push(w.id) : keptWash.push(w)));
  const keptCarpool: ExistingDuty[] = [];
  existingCarpool.forEach((c) =>
    isAbsentFutureDuty(c) && c.id ? result.removeCarpoolIds.push(c.id) : keptCarpool.push(c)
  );

  const existingWashMatchIds = new Set(keptWash.map((w) => w.match_id));
  const carpoolByMatch = new Map<string, Set<string>>();
  existingCarpool.forEach((c) => carpoolByMatch.set(c.match_id, carpoolByMatch.get(c.match_id) ?? new Set()));
  keptCarpool.forEach((c) => carpoolByMatch.get(c.match_id)!.add(c.player_id));

  const washCounts = new Map<string, number>(active.map((p) => [p.id, 0]));
  keptWash.forEach((w) => washCounts.has(w.player_id) && washCounts.set(w.player_id, washCounts.get(w.player_id)! + 1));
  const carCounts = new Map<string, number>(active.map((p) => [p.id, 0]));
  keptCarpool.forEach((c) => carCounts.has(c.player_id) && carCounts.set(c.player_id, carCounts.get(c.player_id)! + 1));

  let washPointer = 0;
  let carPointer = 0;
  const cars = carsNeeded(active.length);

  for (const match of sortedMatches) {
    const absent = absentOn(match.date);

    if (!existingWashMatchIds.has(match.id)) {
      const pick = pickLeastLoaded(active, washCounts, washPointer, absent);
      if (pick) {
        result.wash.push({ match_id: match.id, player_id: pick.id });
        washCounts.set(pick.id, (washCounts.get(pick.id) ?? 0) + 1);
        washPointer = pick.nextPointer;
      }
    }

    if (match.home_away !== "away") continue;
    // Wedstrijden zonder rijbeurten worden volledig gevuld; wedstrijden waar
    // net een afwezige rijder is weggehaald worden alleen aangevuld (vanaf
    // vandaag). Handmatig ingekorte rijderslijsten blijven zo ongemoeid.
    const current = carpoolByMatch.get(match.id);
    const prunedHere = existingCarpool.some(
      (c) => c.match_id === match.id && c.id && result.removeCarpoolIds.includes(c.id)
    );
    if (current && !prunedHere) continue;
    const chosen = new Set<string>(current ?? []);
    const exclude = new Set<string>([...absent, ...chosen]);
    while (chosen.size < cars) {
      const pick = pickLeastLoaded(active, carCounts, carPointer, exclude);
      if (!pick) break;
      result.carpool.push({ match_id: match.id, player_id: pick.id });
      carCounts.set(pick.id, (carCounts.get(pick.id) ?? 0) + 1);
      carPointer = pick.nextPointer;
      chosen.add(pick.id);
      exclude.add(pick.id);
    }
  }

  return result;
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

export type GeneratedCorvee = {
  add: { week_start: string; player_id: string }[];
  removeIds: string[];
};

type ExistingCorvee = { id?: string; week_start: string; player_id: string };

/**
 * Vult en corrigeert corvee voor elke week vanaf de huidige week (voorgaande
 * weken tellen niet mee — dat is al gebeurd, corvee is niet met terugwerkende
 * kracht) met minstens één training of al ingevulde corvee. Regels:
 * 1. Wie die week de wasbeurt heeft (voor een wedstrijd in diezelfde week)
 *    hoort altijd ook bij de corveeploeg — bij meerdere wedstrijden in
 *    dezelfde week tellen ze allemaal mee. Geldt ook voor al ingevulde weken:
 *    ontbreekt de wasbeurt-speler daar, dan neemt die de plek over van de
 *    meest belaste andere speler in die ploeg.
 * 2. Spelers die die week (deels) afwezig zijn worden nooit ingepland; staan
 *    ze al ingedeeld, dan worden ze verwijderd en vervangen.
 * 3. Eerlijk verdeeld over het seizoen (zelfde least-loaded-rotatie als
 *    was/rijden).
 * 4. Bij voorkeur niet twee weken achter elkaar dezelfde speler (zachte
 *    voorkeur, geen harde uitsluiting).
 */
export function generateCorveeSchedule(
  players: Player[],
  scheduleItems: ScheduleItem[],
  matches: Match[],
  washDuty: { match_id: string; player_id: string }[],
  absences: Absence[],
  existingCorvee: ExistingCorvee[] = [],
  today: string = todayIsoLocal()
): GeneratedCorvee {
  const active = players
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const result: GeneratedCorvee = { add: [], removeIds: [] };
  if (active.length === 0) return result;

  const currentWeek = mondayOfWeek(today);
  const weeks = [
    ...new Set([
      ...scheduleItems.filter((s) => isTrainingActivity(s.activity)).map((s) => mondayOfWeek(s.date)),
      ...existingCorvee.map((c) => c.week_start),
    ]),
  ]
    .filter((w) => w >= currentWeek)
    .sort();

  const existingByWeek = new Map<string, ExistingCorvee[]>();
  existingCorvee.forEach((c) => existingByWeek.set(c.week_start, [...(existingByWeek.get(c.week_start) ?? []), c]));
  const counts = new Map<string, number>(active.map((p) => [p.id, 0]));
  existingCorvee.forEach((c) => counts.has(c.player_id) && counts.set(c.player_id, counts.get(c.player_id)! + 1));
  const activeIds = new Set(active.map((p) => p.id));
  const bump = (id: string, delta: number) => counts.has(id) && counts.set(id, counts.get(id)! + delta);
  let pointer = 0;

  // Wie zat er in de week vlak vóór de eerste te vullen week? (Voor regel 4.)
  let previousWeekPlayerIds = new Set<string>(
    weeks.length > 0 ? (existingByWeek.get(addDaysLocal(weeks[0], -7)) ?? []).map((c) => c.player_id) : []
  );

  for (const weekStart of weeks) {
    const weekEnd = addDaysLocal(weekStart, 6);
    const absent = absentPlayerIdsBetween(absences, weekStart, weekEnd);

    // Regel 2: afwezigen uit een al ingevulde ploeg halen.
    const kept: ExistingCorvee[] = [];
    for (const c of existingByWeek.get(weekStart) ?? []) {
      if (absent.has(c.player_id) && c.id) {
        result.removeIds.push(c.id);
        bump(c.player_id, -1);
      } else kept.push(c);
    }

    // Regel 1: iedereen met wasbeurt voor een wedstrijd deze week hoort erbij.
    const matchIdsInWeek = new Set(matches.filter((m) => m.date >= weekStart && m.date <= weekEnd).map((m) => m.id));
    const washIds = [
      ...new Set(
        washDuty
          .filter((w) => matchIdsInWeek.has(w.match_id) && activeIds.has(w.player_id) && !absent.has(w.player_id))
          .map((w) => w.player_id)
      ),
    ];
    const target = Math.max(CORVEE_TEAM_SIZE, washIds.length);

    const team = new Set(kept.map((c) => c.player_id));
    const added: string[] = [];
    for (const id of washIds) {
      if (!team.has(id)) {
        team.add(id);
        added.push(id);
        bump(id, 1);
      }
    }

    // Te vol door toegevoegde wasbeurt-spelers: haal de meest belaste niet-
    // wasbeurt-speler uit de bestaande ploeg.
    const washSet = new Set(washIds);
    while (team.size > target) {
      const removable = kept
        .filter((c) => team.has(c.player_id) && !washSet.has(c.player_id))
        .sort((a, b) => (counts.get(b.player_id) ?? 0) - (counts.get(a.player_id) ?? 0));
      const out = removable[0];
      if (!out) break;
      if (out.id) result.removeIds.push(out.id);
      team.delete(out.player_id);
      bump(out.player_id, -1);
    }

    // Aanvullen: afwezigen hard uitgesloten, vorige week zacht vermeden.
    const exclude = new Set<string>([...absent, ...team]);
    while (team.size < target) {
      const pick = pickLeastLoaded(active, counts, pointer, exclude, previousWeekPlayerIds);
      if (!pick) break;
      team.add(pick.id);
      exclude.add(pick.id);
      added.push(pick.id);
      bump(pick.id, 1);
      pointer = pick.nextPointer;
    }

    added.forEach((id) => result.add.push({ week_start: weekStart, player_id: id }));
    previousWeekPlayerIds = team;
  }

  return result;
}
