import { Absence, LoadEntry } from "./types";

// Aanwezigheid per training/wedstrijd wordt afgeleid uit load_entries (staf-
// of zelf-ingevulde belasting per sessie). Ontbreekt die rij en is er geen
// lopende afwezigheidsperiode, dan is de speler gewoon aanwezig geweest —
// zonder invoer en zonder afmelding is er geen reden om iemand als afwezig of
// "onbekend" te tellen (zelfde uitgangspunt als de snelle aanwezigheidsknop op
// Programma). Zo blijft het aanwezigheidspercentage kloppen ook als iemand de
// belasting (RPE/minuten) nooit heeft ingevuld.
export type AttendanceTally = {
  present: number;
  absent: number;
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
    else present++;
  }

  return { present, absent, total: dates.length };
}
