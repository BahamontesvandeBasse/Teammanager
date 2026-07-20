"use client";

import { EntityMap, EntityName } from "@/lib/types";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Fout (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  list<E extends EntityName>(entity: E): Promise<EntityMap[E][]> {
    return fetch(`/api/data/${entity}`).then((r) => handle(r));
  },
  create<E extends EntityName>(
    entity: E,
    rows: Omit<EntityMap[E], "id"> | Omit<EntityMap[E], "id">[]
  ): Promise<EntityMap[E][]> {
    return fetch(`/api/data/${entity}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    }).then((r) => handle(r));
  },
  update<E extends EntityName>(
    entity: E,
    id: string,
    patch: Partial<EntityMap[E]>
  ): Promise<EntityMap[E]> {
    return fetch(`/api/data/${entity}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => handle(r));
  },
  remove(entity: EntityName, id: string): Promise<void> {
    return fetch(`/api/data/${entity}/${id}`, { method: "DELETE" }).then((r) =>
      handle(r)
    );
  },
  clear(entity: EntityName): Promise<void> {
    return fetch(`/api/data/${entity}`, { method: "DELETE" }).then((r) => handle(r));
  },
  generateSchedule(): Promise<{ wash: number; carpool: number }> {
    return fetch(`/api/generate-schedule`, { method: "POST" }).then((r) => handle(r));
  },
  travelTime(destination: string): Promise<{ minutes: number }> {
    return fetch(`/api/travel-time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination }),
    }).then((r) => handle(r));
  },
};
