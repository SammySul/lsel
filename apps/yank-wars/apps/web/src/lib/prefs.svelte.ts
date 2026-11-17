import type { PuzzleFilter } from "./filter.ts";
import {
  type Best,
  type PrefsStorage,
  readStored,
  type Stored,
  type StoredFilter,
  writeBest,
  writeFilter,
  writeRelativeNumbers,
} from "./prefsStorage.ts";

export type { Best } from "./prefsStorage.ts";

export class Prefs {
  #relativeNumbers = $state(true);
  best = $state.raw<Readonly<Record<string, Best>>>({});
  #lasting = $state.raw<StoredFilter>({ difficulty: null, unsolved: false });
  #query = $state("");
  readonly #storage: PrefsStorage | undefined;

  constructor(storage: PrefsStorage | undefined) {
    this.#storage = storage;
    const stored = readStored(storage);
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
    this.best = writeFilter(this.#storage, this.#mine(), lasting).best;
  }

  get relativeNumbers(): boolean {
    return this.#relativeNumbers;
  }

  set relativeNumbers(on: boolean) {
    this.#relativeNumbers = on;
    this.best = writeRelativeNumbers(this.#storage, this.#mine(), on).best;
  }

  /** Stores `run` if it beats the current best for `id`; returns whether it did. */
  recordBest(id: string, run: Best): boolean {
    const { better, stored } = writeBest(this.#storage, this.#mine(), id, run);
    this.best = stored.best;
    return better;
  }

  #mine(): Stored {
    return {
      relativeNumbers: this.#relativeNumbers,
      best: { ...this.best },
      filter: this.#lasting,
    };
  }
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export const prefs = new Prefs(browserStorage());
