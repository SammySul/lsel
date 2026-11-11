import {
  type Best,
  type PrefsStorage,
  readStored,
  type Stored,
  writeBest,
  writeRelativeNumbers,
} from "./prefsStorage.ts";

export type { Best } from "./prefsStorage.ts";

export class Prefs {
  #relativeNumbers = $state(true);
  best = $state.raw<Readonly<Record<string, Best>>>({});
  readonly #storage: PrefsStorage | undefined;

  constructor(storage: PrefsStorage | undefined) {
    this.#storage = storage;
    const stored = readStored(storage);
    this.#relativeNumbers = stored.relativeNumbers;
    this.best = stored.best;
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
    return { relativeNumbers: this.#relativeNumbers, best: { ...this.best } };
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
