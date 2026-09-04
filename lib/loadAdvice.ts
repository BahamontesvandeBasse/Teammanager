import { LoadEntry } from "./types";

// Een lichte klacht ("kan gewoon mee spelen/trainen") hoeft het trainingsadvies
// niet te overrulen — alleen "matig"/"ernstig" (of onbekende ernst, bij oudere
// rijen van vóór dit veld) doet dat. Voorkomt dat elke aangevinkte blessure,
// ook een lichte kneuzing, meteen als "rustig aan" wordt behandeld.
export function isSeriousInjury(entry: Pick<LoadEntry, "injury_flag" | "injury_severity"> | undefined | null): boolean {
  if (!entry?.injury_flag) return false;
  return entry.injury_severity !== "licht";
}

export const INJURY_SEVERITY_OPTIONS: { value: NonNullable<LoadEntry["injury_severity"]>; label: string }[] = [
  { value: "licht", label: "Licht — kan gewoon mee" },
  { value: "matig", label: "Matig — aangepast" },
  { value: "ernstig", label: "Ernstig — niet inzetbaar" },
];

// Kleur voor een blessure-badge: licht = niet verontrustend, matig = opletten,
// ernstig (of onbekend — oudere rijen zonder dit veld) = serieus.
export function injurySeverityColor(severity: LoadEntry["injury_severity"]): "red" | "amber" | "green" {
  if (severity === "licht") return "green";
  if (severity === "matig") return "amber";
  return "red";
}
