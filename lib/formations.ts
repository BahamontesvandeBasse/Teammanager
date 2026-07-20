import { Player } from "./types";

export type FormationSlot = { id: string; label: string; x: number; y: number };

export const FORMATION_PRESETS = ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1", "3-4-3"];

function lineLabel(lineIdx: number, totalLines: number): string {
  if (totalLines <= 3) return ["D", "M", "A"][lineIdx] ?? `L${lineIdx + 1}`;
  if (totalLines === 4) return ["D", "DM", "AM", "A"][lineIdx] ?? `L${lineIdx + 1}`;
  return `L${lineIdx + 1}`;
}

/**
 * Zet een formatie-string ("4-3-3", "4-2-3-1", ook eigen varianten) om in
 * posities op een veld (x/y in %, y=92 eigen doel, y≈12 aanval).
 */
export function layoutForFormation(formation: string): FormationSlot[] {
  const lines = formation
    .split("-")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (lines.length === 0) return [];

  const slots: FormationSlot[] = [{ id: "gk", label: "K", x: 50, y: 92 }];
  const spacing = 78 / (lines.length + 1);

  lines.forEach((count, lineIdx) => {
    const y = 90 - spacing * (lineIdx + 1);
    const label = lineLabel(lineIdx, lines.length);
    for (let i = 0; i < count; i++) {
      const x = ((i + 1) * 100) / (count + 1);
      slots.push({ id: `l${lineIdx}_${i}`, label, x, y });
    }
  });

  return slots;
}

// Een gastspeler wordt opgeslagen als slotAssignments[slot] = "guest:<slot>", met de naam apart in guestNames.
export function isGuestId(id: string | undefined): boolean {
  return !!id && id.startsWith("guest:");
}

export function resolveSlotPlayer(
  playerId: string | undefined,
  guestNames: Record<string, string>,
  players: Player[]
): { name: string; shirtNumber: number | null; isGuest: boolean } | null {
  if (!playerId) return null;
  if (isGuestId(playerId)) {
    const slotId = playerId.slice("guest:".length);
    return { name: guestNames[slotId] || "Gast", shirtNumber: null, isGuest: true };
  }
  const p = players.find((pl) => pl.id === playerId);
  return p ? { name: p.name, shirtNumber: p.shirt_number, isGuest: false } : null;
}
