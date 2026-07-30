// Standaard positiecodes (zoals ook uit Sportlink-exports komen), zodat
// posities gestructureerd zijn en later automatisch bruikbaar voor opstellingen.
export const POSITION_PRESETS = [
  "GK",
  "RB",
  "RV",
  "CV",
  "LV",
  "LB",
  "CVM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SP",
];

export function parsePositions(raw: string): string[] {
  return raw
    .split(/[/,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

const DEFENSE_CODES = new Set(["GK", "RB", "RV", "CV", "LV", "LB"]);
const MIDFIELD_CODES = new Set(["CVM", "CM", "CAM", "RM", "LM"]);
const ATTACK_CODES = new Set(["RW", "LW", "SP"]);

// Grove indeling van een positiecode in een linie, gebruikt om spelersstatistieken
// en -observaties te groeperen per linie (bv. voor het AI-wedstrijdadvies).
export function lineForPosition(code: string): "verdediging" | "middenveld" | "aanval" | null {
  const c = code.trim().toUpperCase();
  if (DEFENSE_CODES.has(c)) return "verdediging";
  if (MIDFIELD_CODES.has(c)) return "middenveld";
  if (ATTACK_CODES.has(c)) return "aanval";
  return null;
}
