import { persisted } from "@sammysul/lsel";
import { DIFFICULTIES, type Difficulty } from "@yank-wars/engine";
import * as v from "valibot";
import type { PuzzleFilter } from "./filter.ts";

const BestSchema = v.object({
  keys: v.pipe(v.number(), v.integer(), v.minValue(0)),
  ms: v.pipe(v.number(), v.finite(), v.minValue(0)),
});

export type Best = Readonly<v.InferOutput<typeof BestSchema>>;

/** The list filter's lasting part; the search text stays per visit. */
export interface StoredFilter {
  readonly difficulty: Difficulty | null;
  readonly unsolved: boolean;
}

/** Field by field: a bad value falls back on its own, and a bad best is dropped. */
export const Stored = v.object({
  relativeNumbers: v.fallback(v.boolean(), true),
  best: v.fallback(
    v.pipe(
      v.record(v.string(), v.unknown()),
      v.transform(
        (all) =>
          Object.fromEntries(Object.entries(all).filter(([, b]) => v.is(BestSchema, b))) as Record<
            string,
            Best
          >,
      ),
    ),
    {},
  ),
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

// Same order as a match: fewer keys wins, then the faster finish.
export function isBetter(a: Best, b: Best): boolean {
  return a.keys < b.keys || (a.keys === b.keys && a.ms < b.ms);
}

export class Prefs {
  #relativeNumbers = $state(true);
  best = $state.raw<Readonly<Record<string, Best>>>({});
  #lasting = $state.raw<StoredFilter>({ difficulty: null, unsolved: false });
  #query = $state("");
  readonly #storage: Pick<Storage, "getItem" | "setItem"> | undefined;

  /** Without `storage`, the browser's. */
  constructor(storage?: Pick<Storage, "getItem" | "setItem">) {
    this.#storage = storage;
    const stored = this.#slot().value;
    this.#relativeNumbers = stored.relativeNumbers;
    this.best = stored.best;
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

  /** Stores `run` if it beats the best for `id` in any tab; returns whether it did. */
  recordBest(id: string, run: Best): boolean {
    let better = false;
    this.#update((s) => {
      const prev = s.best[id];
      better = prev === undefined || isBetter(run, prev);
      if (better) s.best[id] = run;
    });
    return better;
  }

  #mine(): Stored {
    return {
      relativeNumbers: this.#relativeNumbers,
      best: { ...this.best },
      filter: this.#lasting,
    };
  }

  // Read afresh each time: another tab may have written since this one loaded.
  #slot(): { value: Stored } {
    return persisted(KEY, Stored, this.#mine(), this.#storage);
  }

  // Keeps the better best per puzzle from both tabs; this tab shows only the merged bests.
  #update(change: (s: Stored) => void): void {
    const slot = this.#slot();
    const next: Stored = { ...slot.value, best: { ...slot.value.best } };
    for (const [id, b] of Object.entries(this.best)) {
      const theirs = next.best[id];
      if (theirs === undefined || isBetter(b, theirs)) next.best[id] = b;
    }
    change(next);
    slot.value = next;
    this.best = next.best;
  }
}

export const prefs = new Prefs();
