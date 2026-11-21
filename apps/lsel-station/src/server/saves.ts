import { Database } from "bun:sqlite";
import { importString, MAX_SAVE_BYTES, playedMs } from "../save/document.ts";

// how many of a save's latest revisions it remembers having stored
const HISTORY = 20;

/** What the service keeps of a save: the text the game exported, and what it shows about it in a conflict. */
export type Stored = { revision: number; savedAt: number; playedMs: number; data: string };

export type Saves = ReturnType<typeof openSaves>;

/** The synced saves, one row per save key, in a SQLite file (`:memory:` for tests). */
export function openSaves(path: string) {
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(`CREATE TABLE IF NOT EXISTS saves (
    id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL,
    saved_at INTEGER NOT NULL,
    played_ms INTEGER NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS accepted (
    id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    saved_at INTEGER NOT NULL,
    PRIMARY KEY (id, revision)
  )`);
  const read = db.query<
    { revision: number; saved_at: number; played_ms: number; data: string },
    [string]
  >("SELECT revision, saved_at, played_ms, data FROM saves WHERE id = ?");
  const insert = db.query(
    "INSERT INTO saves (id, revision, saved_at, played_ms, data, updated_at) VALUES (?, 1, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
  );
  const update = db.query(
    "UPDATE saves SET revision = revision + 1, saved_at = ?, played_ms = ?, data = ?, updated_at = ? WHERE id = ? AND revision = ?",
  );

  const accept = db.query(
    "INSERT OR REPLACE INTO accepted (id, revision, saved_at) VALUES (?, ?, ?)",
  );
  const prune = db.query("DELETE FROM accepted WHERE id = ? AND revision <= ?");
  const landed = db.query<{ found: number }, [string, number]>(
    "SELECT 1 AS found FROM accepted WHERE id = ? AND saved_at = ?",
  );

  function get(id: string): Stored | null {
    const row = read.get(id);
    return row === null
      ? null
      : { revision: row.revision, savedAt: row.saved_at, playedMs: row.played_ms, data: row.data };
  }

  return {
    get,
    /** Whether a save stamped `savedAt` was stored lately: a device whose last send went unanswered asks. */
    landed: (id: string, savedAt: number) => landed.get(id, savedAt) !== null,
    /** Stores `data` if the save is still at `base` (0 for a new one); otherwise returns what is there, to ask which to keep. */
    put(
      id: string,
      base: number,
      data: string,
      now: number,
    ):
      | { ok: true; revision: number }
      | { ok: false; current: Stored }
      | { ok: false; reason: string } {
      const parsed = importString(data);
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      const { savedAt } = parsed.doc;
      const played = playedMs(parsed.doc);
      const changed =
        base === 0
          ? insert.run(id, savedAt, played, data, now).changes
          : update.run(savedAt, played, data, now, id, base).changes;
      const current = get(id);
      if (changed === 1 && current !== null) {
        accept.run(id, current.revision, savedAt);
        prune.run(id, current.revision - HISTORY);
        return { ok: true, revision: current.revision };
      }
      if (current === null) return { ok: false, reason: "no such save" };
      return { ok: false, current };
    },
    close: () => db.close(),
  };
}

/** The service's limits: a save's size, and requests per minute for one save and for one address. */
export const LIMITS = { bytes: MAX_SAVE_BYTES * 2, perSave: 30, perAddress: 120 } as const;

/** Counts requests per key in fixed one-minute windows. */
export function rateLimiter(limit: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return (key: string, now: number): boolean => {
    const window = windows.get(key);
    if (window === undefined || now - window.start >= 60_000) {
      if (windows.size > 10_000) windows.clear();
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    window.count++;
    return window.count <= limit;
  };
}
