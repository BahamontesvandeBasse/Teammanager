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

/**
 * Round-robin over de actieve spelers (gesorteerd op naam) zodat iedereen
 * over het seizoen zo gelijk mogelijk aan de beurt komt.
 * - Wasbeurt: 1 speler per wedstrijd (thuis én uit).
 * - Rijbeurt: alleen uitwedstrijden, ceil(spelers/4) rijders per wedstrijd.
 * Was- en rijrotatie lopen onafhankelijk van elkaar door.
 */
export function generateSchedule(players: Player[], matches: Match[]): GeneratedSchedule {
  const active = players
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const sortedMatches = [...matches].sort((a, b) =>
    `${a.date} ${a.kickoff_time}`.localeCompare(`${b.date} ${b.kickoff_time}`)
  );

  const wash: GeneratedSchedule["wash"] = [];
  const carpool: GeneratedSchedule["carpool"] = [];
  if (active.length === 0) return { wash, carpool };

  let washIdx = 0;
  let carIdx = 0;

  for (const match of sortedMatches) {
    wash.push({ match_id: match.id, player_id: active[washIdx % active.length].id });
    washIdx++;

    if (match.home_away === "away") {
      const cars = carsNeeded(active.length);
      for (let c = 0; c < cars; c++) {
        carpool.push({ match_id: match.id, player_id: active[carIdx % active.length].id });
        carIdx++;
      }
    }
  }

  return { wash, carpool };
}
