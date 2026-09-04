import { Absence, LoadEntry } from "./types";

// Aanwezigheid per training/wedstrijd wordt afgeleid uit load_entries (staf-
// of zelf-ingevulde belasting per sessie). Ontbreekt die rij, dan weten we
// niet of de speler aanwezig was of dat de invoer gewoon vergeten is — dat
// mag dus niet als "afwezig" meetellen. Een lopende afwezigheidsperiode telt
// wél als afwezig, ook zonder losse invoer voor die datum.
export type AttendanceTally = {
  present: number;
  absent: number;
  unfilled: number; // wél gepland, nog geen invoer en geen bekende afwezigheid
  total: number;
};

export function tallyAttendance(
  dates: string[],
  playerId: string,
  entries: LoadEntry[],
  sessionType: "training" | "wedstrijd",
  absences: Absence[]
): AttendanceTally {
  let present = 0;
  let absent = 0;
  let unfilled = 0;

  for (const date of dates) {
    const entry = entries.find(
      (e) => e.player_id === playerId && e.session_type === sessionType && e.date === date
    );
    if (entry) {
      if (entry.absent) absent++;
      else present++;
      continue;
    }
    const coveredByAbsence = absences.some(
      (a) => a.player_id === playerId && date >= a.from && date <= a.until
    );
    if (coveredByAbsence) absent++;
    else unfilled++;
  }

  return { present, absent, unfilled, total: dates.length };
}
