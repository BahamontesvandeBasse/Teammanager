import { EntityName, ENTITIES } from "@/lib/types";
import { localStore } from "@/lib/db/local";
import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";
import { adminConfigured, createSupabaseAdminClient } from "@/lib/supabase/admin";

// Datalaag: gebruikt Supabase zodra de env-variabelen zijn ingevuld,
// anders een lokale JSON-store zodat de app direct lokaal werkt.

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

function supabaseStore(): DataStore {
  return {
    async list(entity) {
      const sb = await createSupabaseServerClient();
      const { data, error } = await sb.from(entity).select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
    async insert(entity, rows) {
      const sb = await createSupabaseServerClient();
      const { data, error } = await sb.from(entity).insert(rows).select();
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
    async update(entity, id, patch) {
      const sb = await createSupabaseServerClient();
      const { data, error } = await sb.from(entity).update(patch).eq("id", id).select();
      if (error) throw new Error(error.message);
      return ((data ?? [])[0] as Row) ?? null;
    },
    async remove(entity, id) {
      const sb = await createSupabaseServerClient();
      const { error } = await sb.from(entity).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async clear(entity) {
      const sb = await createSupabaseServerClient();
      const { error } = await sb.from(entity).delete().not("id", "is", null);
      if (error) throw new Error(error.message);
    },
  };
}

export function getStore(): DataStore {
  return supabaseConfigured() ? supabaseStore() : localStore;
}

function supabaseAdminStoreImpl(): DataStore {
  const sb = createSupabaseAdminClient();
  return {
    async list(entity) {
      const { data, error } = await sb.from(entity).select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
    async insert(entity, rows) {
      const { data, error } = await sb.from(entity).insert(rows).select();
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
    async update(entity, id, patch) {
      const { data, error } = await sb.from(entity).update(patch).eq("id", id).select();
      if (error) throw new Error(error.message);
      return ((data ?? [])[0] as Row) ?? null;
    },
    async remove(entity, id) {
      const { error } = await sb.from(entity).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async clear(entity) {
      const { error } = await sb.from(entity).delete().not("id", "is", null);
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Datalaag voor routes zonder staf-login (spelers gebruiken een token, geen
 * Supabase-sessie). Gebruikt de service-role key zodra die is ingevuld
 * (omzeilt RLS bewust, na expliciete tokenvalidatie in de route zelf);
 * anders dezelfde lokale JSON-store als getStore().
 */
export function getAdminStore(): DataStore {
  return adminConfigured() ? supabaseAdminStoreImpl() : localStore;
}
