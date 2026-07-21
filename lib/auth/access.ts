import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { neonConfigured } from "@/lib/db/neonClient";
import { getStore } from "@/lib/db";
import { EntityName } from "@/lib/types";
import { canEdit, Role, ROLES } from "@/lib/auth/roles";

type Row = Record<string, unknown> & { id: string };

export function canWriteEntity(role: Role): boolean {
  return canEdit(role);
}

export const VIEW_AS_COOKIE = "view_as";

/**
 * De echte rol van de ingelogde gebruiker (session), zonder rekening te
 * houden met "bekijk als"-modus. Gebruik dit voor alles wat altijd bij het
 * eigen account moet horen: beheerdersfuncties (gebruikersbeheer) en de
 * "bekijk als"-schakelaar zelf — anders zou een beheerder die zichzelf als
 * speler laat weergeven, zichzelf buitensluiten van die schakelaar.
 */
export async function getRealRole(): Promise<Role> {
  if (!neonConfigured()) return "admin";
  const session = await auth();
  return (session?.user?.role as Role | undefined) ?? "toeschouwer";
}

/**
 * Bepaalt de effectieve rol van de huidige request: de echte rol, tenzij de
 * beheerder via de "bekijk als"-schakelaar tijdelijk een andere rol simuleert
 * (cookie VIEW_AS_COOKIE) — zo kan de beheerder precies zien wat een staf/
 * toeschouwer/speler-account te zien krijgt, inclusief de server-side
 * redactie/schrijfbeveiliging hieronder, zonder in te hoeven loggen als
 * iemand anders. Alleen mogelijk als de echte rol admin is.
 */
export async function resolveRole(): Promise<Role> {
  const real = await getRealRole();
  if (real !== "admin") return real;

  const store = await cookies();
  const viewAs = store.get(VIEW_AS_COOKIE)?.value as Role | undefined;
  if (viewAs && viewAs !== "admin" && (ROLES as string[]).includes(viewAs)) {
    return viewAs;
  }
  return real;
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
