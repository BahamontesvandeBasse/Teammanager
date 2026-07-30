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
 * De player-rij gekoppeld aan het ingelogde account (alleen relevant voor
 * "speler"-accounts) — gebruikt om spelers te beperken tot hun eigen profiel.
 */
export async function getSessionPlayerId(): Promise<string | null> {
  if (!neonConfigured()) return null;
  const session = await auth();
  return session?.user?.playerId ?? null;
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
 * - "speler" en "toeschouwer" zien geen beoordelingen of gespeelde minuten
 *   (match_stats.rating / minutes_played) — niet van zichzelf, en niet van
 *   teamgenoten. minutes_played wordt niet naar null gezet maar naar 0/1,
 *   zodat afgeleide "aantal wedstrijden gespeeld"-tellingen (die controleren
 *   op minutes_played > 0) elders in de app correct blijven werken zonder de
 *   echte minuten prijs te geven.
 * - "speler" ziet daarnaast wedstrijdvoorbereiding pas nadat de wedstrijd is gespeeld.
 * - "speler" ziet alleen zijn/haar eigen belasting (load_entries), nooit die
 *   van teamgenoten — ook niet via een rechtstreekse API-call.
 */
export async function redactForRole(entity: EntityName, rows: Row[], role: Role): Promise<Row[]> {
  if (role !== "speler" && role !== "toeschouwer") return rows;

  if (entity === "match_stats") {
    return rows.map((r) => ({
      ...r,
      rating: null,
      minutes_played: (r.minutes_played as number) > 0 ? 1 : 0,
    }));
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

  if (entity === "load_entries") {
    const ownPlayerId = await getSessionPlayerId();
    return rows.filter((r) => r.player_id === ownPlayerId);
  }

  return rows;
}
