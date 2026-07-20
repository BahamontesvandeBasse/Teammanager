import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { EntityName, ENTITIES } from "@/lib/types";

// Simpele JSON-file store voor lokaal gebruik zonder Supabase.
// Data staat in <projectroot>/data/db.json (gitignored).

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

type Row = Record<string, unknown> & { id: string };
type DbShape = Record<EntityName, Row[]>;

function emptyDb(): DbShape {
  return Object.fromEntries(ENTITIES.map((e) => [e, []])) as unknown as DbShape;
}

async function readDb(): Promise<DbShape> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    return { ...emptyDb(), ...parsed };
  } catch {
    return emptyDb();
  }
}

async function writeDb(db: DbShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

// Elke lees-wijzig-schrijf-actie loopt serieel via deze wachtrij. Zonder dit
// overschrijven gelijktijdige requests (bv. Promise.all met meerdere deletes)
// elkaars wijzigingen, omdat elke request het hele bestand opnieuw inleest en
// wegschrijft — de laatste write "wint" en de rest gaat stilletjes verloren.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export const localStore = {
  list(entity: EntityName): Promise<Row[]> {
    return enqueue(async () => {
      const db = await readDb();
      return db[entity];
    });
  },

  insert(entity: EntityName, rows: Record<string, unknown>[]): Promise<Row[]> {
    return enqueue(async () => {
      const db = await readDb();
      const withIds = rows.map((r) => ({ ...r, id: (r.id as string) || randomUUID() }));
      db[entity].push(...withIds);
      await writeDb(db);
      return withIds;
    });
  },

  update(entity: EntityName, id: string, patch: Record<string, unknown>): Promise<Row | null> {
    return enqueue(async () => {
      const db = await readDb();
      const idx = db[entity].findIndex((r) => r.id === id);
      if (idx === -1) return null;
      db[entity][idx] = { ...db[entity][idx], ...patch, id };
      await writeDb(db);
      return db[entity][idx];
    });
  },

  remove(entity: EntityName, id: string): Promise<void> {
    return enqueue(async () => {
      const db = await readDb();
      db[entity] = db[entity].filter((r) => r.id !== id);
      await writeDb(db);
    });
  },

  clear(entity: EntityName): Promise<void> {
    return enqueue(async () => {
      const db = await readDb();
      db[entity] = [];
      await writeDb(db);
    });
  },
};
