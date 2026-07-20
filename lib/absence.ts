import { Absence } from "./types";

export type AbsenceStatus = { kind: "current" | "upcoming"; absence: Absence };

function absenceStatusFrom(relevant: Absence[], today: string): AbsenceStatus | null {
  if (relevant.length === 0) return null;
  const current = relevant.find((a) => a.from <= today);
  return current ? { kind: "current", absence: current } : { kind: "upcoming", absence: relevant[0] };
}

export function playerAbsenceStatus(playerId: string, absences: Absence[], today: string): AbsenceStatus | null {
  const relevant = absences
    .filter((a) => a.player_id === playerId && a.until >= today)
    .sort((a, b) => a.from.localeCompare(b.from));
  return absenceStatusFrom(relevant, today);
}

export function staffAbsenceStatus(staffId: string, absences: Absence[], today: string): AbsenceStatus | null {
  const relevant = absences
    .filter((a) => a.staff_id === staffId && a.until >= today)
    .sort((a, b) => a.from.localeCompare(b.from));
  return absenceStatusFrom(relevant, today);
}
