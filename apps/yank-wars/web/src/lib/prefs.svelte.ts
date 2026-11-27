// What the browser remembers: bests, dailies solved, line numbers, the list filter and the player's name; an account keeps bests, dailies and name across devices.

import type { Store } from "@sammysul/lsel";
import { type Account, Best, DIFFICULTIES, type Difficulty, LIMITS } from "@yank-wars/engine";
import * as v from "valibot";
import type { PuzzleFilter } from "./filter.ts";

/** The list filter's lasting part; the search text stays per visit. */
interface StoredFilter {
  readonly difficulty: Difficulty | null;
  readonly unsolved: boolean;
}

/** Field by field: a bad value falls back on its own, and a best the account would refuse is dropped. */
export const Stored = v.object({
  relativeNumbers: v.fallback(v.boolean(), true),
  name: v.fallback(v.pipe(v.string(), v.maxLength(LIMITS.nameLength)), ""),
  best: v.fallback(
    v.pipe(
      v.record(v.string(), v.unknown()),
      v.transform(
        (all) =>
          Object.fromEntries(Object.entries(all).filter(([, b]) => v.is(Best, b))) as Record<
            string,
            Best
          >,
      ),
    ),
    {},
  ),
  /** the days whose daily was solved, oldest first */
  daily: v.fallback(v.array(v.pipe(v.number(), v.integer())), []),
  filter: v.fallback(
    v.object({
      difficulty: v.fallback(v.nullable(v.picklist(DIFFICULTIES)), null),
      unsolved: v.fallback(v.boolean(), false),
    }),
    { difficulty: null, unsolved: false },
  ),
});

type Stored = v.InferOutput<typeof Stored>;

const KEY = "yank-wars:prefs:v1";

function browserStore(): Store | undefined {
  try {
    // lsel-allow: bests merge with other tabs' on every write, a re-read persisted() doesn't do
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** What's stored, or undefined when nothing readable is. */
function read(storage: Store | undefined): Stored | undefined {
  let raw: unknown = null;
  try {
    raw = JSON.parse(storage?.getItem(KEY) ?? "null");
  } catch {}
  const r = v.safeParse(Stored, raw);
  return r.success ? r.output : undefined;
}

// a year of dailies is plenty for any streak worth showing
const DAILY_KEPT = 400;

/** What changed on this device, for an account to sync. */
export type Change = "best" | "daily" | "name";

// Same order as a match: fewer keys wins, then the faster finish.
function isBetter(a: Best, b: Best): boolean {
  return a.keys < b.keys || (a.keys === b.keys && a.ms < b.ms);
}

export class Prefs {
  #relativeNumbers = $state(true);
  #name = $state("");
  best = $state.raw<Readonly<Record<string, Best>>>({});
  daily = $state.raw<readonly number[]>([]);
  #listener: ((change: Change) => void) | undefined;
  #lasting = $state.raw<StoredFilter>({ difficulty: null, unsolved: false });
  #query = $state("");
  readonly #storage: Store | undefined;

  constructor(storage = browserStore()) {
    this.#storage = storage;
    const stored = read(storage) ?? this.#mine();
    this.#relativeNumbers = stored.relativeNumbers;
    this.#name = stored.name;
    this.best = stored.best;
    this.daily = stored.daily;
    this.#lasting = stored.filter;
  }

  get filter(): PuzzleFilter {
    return { ...this.#lasting, query: this.#query };
  }

  /** Difficulty and unsolved are stored; the search text lasts until reload. */
  set filter(f: PuzzleFilter) {
    this.#query = f.query;
    const lasting = { difficulty: f.difficulty, unsolved: f.unsolved };
    if (
      lasting.difficulty === this.#lasting.difficulty &&
      lasting.unsolved === this.#lasting.unsolved
    ) {
      return;
    }
    this.#lasting = lasting;
    this.#update((s) => {
      s.filter = lasting;
    });
  }

  get relativeNumbers(): boolean {
    return this.#relativeNumbers;
  }

  set relativeNumbers(on: boolean) {
    this.#relativeNumbers = on;
    this.#update((s) => {
      s.relativeNumbers = on;
    });
  }

  /** What a room shows the other player. */
  get name(): string {
    return this.#name;
  }

  set name(name: string) {
    if (name === this.#name) return;
    this.#name = name;
    this.#update((s) => {
      s.name = name;
    });
    this.#listener?.("name");
  }

  /** Hears every change made on this device, but not what `adopt` brings in. */
  listen(listener: (change: Change) => void): void {
    this.#listener = listener;
  }

  /** Takes in an account's side: the better best of each puzzle, every day, and its name once it has one. */
  adopt(account: Account): void {
    if (account.name !== "") this.#name = account.name;
    this.#update((s) => {
      for (const [id, b] of Object.entries(account.best)) {
        const mine = s.best[id];
        if (mine === undefined || isBetter(b, mine)) s.best[id] = b;
      }
      s.daily = [...new Set([...s.daily, ...account.daily])]
        .sort((a, b) => a - b)
        .slice(-DAILY_KEPT);
      if (account.name !== "") s.name = account.name;
    });
  }

  /** Marks `day`'s daily solved. */
  solvedDaily(day: number): void {
    if (this.daily.includes(day)) return;
    this.#update((s) => {
      s.daily = [...new Set([...s.daily, day])].sort((a, b) => a - b).slice(-DAILY_KEPT);
    });
    this.#listener?.("daily");
  }

  /** Stores `run` if it beats the best for `id` in any tab; returns whether it did. */
  recordBest(id: string, run: Best): boolean {
    let better = false;
    this.#update((s) => {
      const prev = s.best[id];
      better = prev === undefined || isBetter(run, prev);
      if (better) s.best[id] = run;
    });
    if (better) this.#listener?.("best");
    return better;
  }

  #mine(): Stored {
    return {
      relativeNumbers: this.#relativeNumbers,
      name: this.#name,
      best: { ...this.best },
      daily: [...this.daily],
      filter: this.#lasting,
    };
  }

  // Read afresh: another tab may have written since this one loaded; keep the better best of both.
  #update(change: (s: Stored) => void): void {
    const next = read(this.#storage) ?? this.#mine();
    for (const [id, b] of Object.entries(this.best)) {
      const theirs = next.best[id];
      if (theirs === undefined || isBetter(b, theirs)) next.best[id] = b;
    }
    next.daily = [...new Set([...next.daily, ...this.daily])].sort((a, b) => a - b);
    change(next);
    try {
      this.#storage?.setItem(KEY, JSON.stringify(next));
    } catch {}
    this.best = next.best;
    this.daily = next.daily;
  }
}

export const prefs = new Prefs();
