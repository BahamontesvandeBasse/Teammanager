import { LoadEntry, Match, MatchReflection, ScheduleItem } from "./types";
import { isTrainingActivity } from "./training";

// Hoeveel dagen terug een speler nog belasting mag invullen voor een gemiste
// sessie — zelfde venster als het invulformulier op het spelersprofiel.
export const LOAD_SELF_WINDOW_DAYS = 10;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type OpenLoadSession = {
  date: string;
  sessionType: "training" | "wedstrijd";
  label: string;
};

// Trainingen/wedstrijden in de afgelopen LOAD_SELF_WINDOW_DAYS dagen waarvoor
// deze speler nog geen belasting (of afmelding) heeft ingevuld — gebruikt om
// openstaande taken te tonen op het Dashboard.
export function openLoadSessions(
  scheduleItems: ScheduleItem[],
  matches: Match[],
  load: LoadEntry[],
  today: string
): OpenLoadSession[] {
  const filledSessionKeys = new Set(load.map((l) => `${l.date}|${l.session_type}`));
  const windowStart = addDaysIso(today, -LOAD_SELF_WINDOW_DAYS);
  return [
    ...scheduleItems
      .filter((s) => isTrainingActivity(s.activity) && s.date >= windowStart && s.date <= today)
      .map((s) => ({ date: s.date, sessionType: "training" as const, label: s.activity })),
    ...matches
      .filter((m) => m.date >= windowStart && m.date <= today)
      .map((m) => ({
        date: m.date,
        sessionType: "wedstrijd" as const,
        label: `Wedstrijd ${m.home_away === "home" ? "thuis" : "uit"} tegen ${m.opponent}`,
      })),
  ]
    .filter((o) => !filledSessionKeys.has(`${o.date}|${o.sessionType}`))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Gespeelde wedstrijden waar deze speler nog geen zelfreflectie voor heeft ingevuld.
// Gebaseerd op de wedstrijddatum, niet op of de staf de uitslag al heeft ingevuld —
// die wordt soms pas een dag later ingevoerd, waardoor spelers anders te laat
// zouden zijn om nog te reflecteren.
export function openReflectionMatches(matches: Match[], reflections: MatchReflection[], today: string): Match[] {
  const reflected = new Set(reflections.map((r) => r.match_id));
  return [...matches]
    .filter((m) => m.date <= today && !reflected.has(m.id))
    .sort((a, b) => b.date.localeCompare(a.date));
}
