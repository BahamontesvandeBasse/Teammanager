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
