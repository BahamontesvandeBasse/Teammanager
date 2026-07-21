import { auth } from "@/lib/auth";
import { neonConfigured } from "@/lib/db/neonClient";
import { getStore } from "@/lib/db";
import { EntityName } from "@/lib/types";
import { canEdit, Role } from "@/lib/auth/roles";

type Row = Record<string, unknown> & { id: string };

export function canWriteEntity(role: Role): boolean {
  return canEdit(role);
}

/**
 * Bepaalt de rol van de huidige request. In lokale modus (geen Neon, dus
 * geen login) is er geen sessie — dan gedraagt de app zich zoals voorheen
 * (volledige toegang). Zodra Neon actief is loopt elke server-toegang via
 * proxy.ts, dus is er altijd een sessie; "toeschouwer" is de veilige
 * fallback als die er onverwacht toch niet is.
 */
export async function resolveRole(): Promise<Role> {
  if (!neonConfigured()) return "admin";
  const session = await auth();
  return (session?.user?.role as Role | undefined) ?? "toeschouwer";
}

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Redigeert/filtert rijen op basis van de rol van de aanvrager:
 * - "speler" en "toeschouwer" zien geen beoordelingen (match_stats.rating).
 * - "speler" ziet daarnaast wedstrijdvoorbereiding pas nadat de wedstrijd is gespeeld.
 */
export async function redactForRole(entity: EntityName, rows: Row[], role: Role): Promise<Row[]> {
  if (role !== "speler" && role !== "toeschouwer") return rows;

  if (entity === "match_stats") {
    return rows.map((r) => ({ ...r, rating: null }));
  }

  if (role !== "speler") return rows;

  if (entity === "match_preparations") {
    const matches = (await getStore().list("matches")) as Row[];
    const today = TODAY();
    const playedMatchIds = new Set(
      matches.filter((m) => typeof m.date === "string" && m.date <= today).map((m) => m.id)
    );
    return rows.filter((r) => playedMatchIds.has(r.match_id as string));
  }

  return rows;
}
