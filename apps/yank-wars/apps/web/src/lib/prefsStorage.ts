export interface Best {
  readonly keys: number;
  readonly ms: number;
}

export interface Stored {
  relativeNumbers: boolean;
  best: Record<string, Best>;
}

export type PrefsStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "yank-wars:prefs:v1";

function isBest(x: unknown): x is Best {
  if (typeof x !== "object" || x === null) return false;
  const { keys, ms } = x as Record<string, unknown>;
  return (
    typeof keys === "number" &&
    Number.isInteger(keys) &&
    keys >= 0 &&
    typeof ms === "number" &&
    Number.isFinite(ms) &&
    ms >= 0
  );
}

function parseStored(raw: string | null): Stored {
  const stored: Stored = { relativeNumbers: true, best: {} };
  if (raw === null) return stored;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return stored;
  }
  if (typeof data !== "object" || data === null) return stored;
  const { relativeNumbers, best } = data as Record<string, unknown>;
  if (typeof relativeNumbers === "boolean") stored.relativeNumbers = relativeNumbers;
  if (typeof best === "object" && best !== null) {
    for (const [id, b] of Object.entries(best)) if (isBest(b)) stored.best[id] = b;
  }
  return stored;
}

// Same order as a match: fewer keys wins, then the faster finish.
export function isBetter(a: Best, b: Best): boolean {
  return a.keys < b.keys || (a.keys === b.keys && a.ms < b.ms);
}

export function readStored(storage: PrefsStorage | undefined): Stored {
  try {
    return parseStored(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return parseStored(null);
  }
}

// Another tab may have written since this one loaded: re-read, keep the better best per puzzle, write back.
function update(
  storage: PrefsStorage | undefined,
  mine: Stored,
  change: (s: Stored) => void,
): Stored {
  let fresh: Stored | undefined;
  try {
    fresh = storage ? parseStored(storage.getItem(STORAGE_KEY)) : undefined;
  } catch {}
  const next: Stored = fresh ?? { relativeNumbers: mine.relativeNumbers, best: {} };
  for (const [id, b] of Object.entries(mine.best)) {
    const theirs = next.best[id];
    if (theirs === undefined || isBetter(b, theirs)) next.best[id] = b;
  }
  change(next);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

/** Stores `run` if it beats the best for `id` in any tab; `stored` is what this tab should show. */
export function writeBest(
  storage: PrefsStorage | undefined,
  mine: Stored,
  id: string,
  run: Best,
): { better: boolean; stored: Stored } {
  let better = false;
  const stored = update(storage, mine, (s) => {
    const prev = s.best[id];
    better = prev === undefined || isBetter(run, prev);
    if (better) s.best[id] = run;
  });
  return { better, stored };
}

export function writeRelativeNumbers(
  storage: PrefsStorage | undefined,
  mine: Stored,
  on: boolean,
): Stored {
  return update(storage, mine, (s) => {
    s.relativeNumbers = on;
  });
}
