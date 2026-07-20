import { EntityName, ENTITIES } from "@/lib/types";
import { localStore } from "@/lib/db/local";
import { neonStore } from "@/lib/db/neon";
import { neonConfigured } from "@/lib/db/neonClient";

// Datalaag: gebruikt Neon zodra DATABASE_URL is ingevuld, anders een lokale
// JSON-store zodat de app direct lokaal werkt zonder database.

type Row = Record<string, unknown> & { id: string };

export function isValidEntity(name: string): name is EntityName {
  return (ENTITIES as string[]).includes(name);
}

export interface DataStore {
  list(entity: EntityName): Promise<Row[]>;
  insert(entity: EntityName, rows: Record<string, unknown>[]): Promise<Row[]>;
  update(entity: EntityName, id: string, patch: Record<string, unknown>): Promise<Row | null>;
  remove(entity: EntityName, id: string): Promise<void>;
  clear(entity: EntityName): Promise<void>;
}

export function getStore(): DataStore {
  return neonConfigured() ? neonStore : localStore;
}

/**
 * Datalaag voor routes zonder staf-login (spelers gebruiken een token, geen
 * ingelogde sessie). Neon heeft geen RLS-laag zoals Supabase had — alle
 * toegang loopt via dezelfde vertrouwde serververbinding, dus dit is gewoon
 * dezelfde store als getStore(). Blijft een aparte functie zodat routes die
 * hem gebruiken expliciet blijven aangeven dat ze zelf verantwoordelijk zijn
 * voor het valideren van het spelerstoken vóór ze de store aanspreken.
 */
export function getAdminStore(): DataStore {
  return getStore();
}
