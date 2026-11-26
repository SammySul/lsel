// Checks claims in a worker, one at a time, so a slow replay never blocks the rooms.

import type { KeyLog, Puzzle } from "@yank-wars/engine";

export interface ReplayRequest {
  id: number;
  puzzle: Puzzle;
  log: KeyLog;
}

export interface ReplayReply {
  id: number;
  ok: boolean;
  score: number;
  doc: string;
  errors: { index: number; message: string }[];
}

export type Verdict =
  | { ok: true; score: number }
  | { ok: false; reason: "mismatch"; doc: string; errors: ReplayReply["errors"] }
  | { ok: false; reason: "too slow" };

interface Job {
  req: ReplayRequest;
  done: (v: Verdict) => void;
}

/** One replay worker fed from a FIFO queue; a replay over `timeoutMs` is refused and the worker replaced. */
export class Replayer {
  readonly #timeoutMs: number;
  readonly #queue: Job[] = [];
  #worker: Worker | null = null;
  #running: Job | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #next = 0;

  constructor(timeoutMs = 2_000) {
    this.#timeoutMs = timeoutMs;
  }

  verify(puzzle: Puzzle, log: KeyLog): Promise<Verdict> {
    return new Promise((done) => {
      this.#queue.push({ req: { id: this.#next++, puzzle, log }, done });
      this.#pump();
    });
  }

  close(): void {
    clearTimeout(this.#timer);
    this.#worker?.terminate();
    this.#worker = null;
  }

  #spawn(): Worker {
    const w = new Worker(new URL("./replay.worker.ts", import.meta.url).href);
    w.onmessage = (e: MessageEvent<ReplayReply>) => this.#finish(e.data);
    return w;
  }

  #pump(): void {
    if (this.#running !== null) return;
    const job = this.#queue.shift();
    if (job === undefined) return;
    this.#running = job;
    this.#worker ??= this.#spawn();
    this.#timer = setTimeout(() => this.#timeout(job), this.#timeoutMs);
    this.#worker.postMessage(job.req);
  }

  #finish(r: ReplayReply): void {
    const job = this.#running;
    if (job === null || job.req.id !== r.id) return;
    clearTimeout(this.#timer);
    this.#running = null;
    job.done(
      r.ok
        ? { ok: true, score: r.score }
        : { ok: false, reason: "mismatch", doc: r.doc, errors: r.errors },
    );
    this.#pump();
  }

  #timeout(job: Job): void {
    if (this.#running !== job) return;
    this.#worker?.terminate();
    this.#worker = null;
    this.#running = null;
    job.done({ ok: false, reason: "too slow" });
    this.#pump();
  }
}
