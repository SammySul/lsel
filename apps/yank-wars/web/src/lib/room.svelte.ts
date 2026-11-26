import {
  type KeyLog,
  PROTOCOL,
  type Puzzle,
  type RoomView,
  type Seat,
  type ServerFrame,
} from "@yank-wars/engine";
import type { Prefs } from "./prefs.svelte.ts";
import { RoundController, type RoundLink } from "./round.svelte.ts";

export const RECONNECT_MS: readonly number[] = [500, 1_000, 2_000, 4_000, 7_500];
/** Entries per `keys` frame, well under the 16 KB frame limit. */
const BATCH = 500;
/** `keys` frames at most this often, so fast typing stays under the server's frame limit. */
export const SEND_MS = 50;

export type Connection =
  | { kind: "connecting" }
  | { kind: "open" }
  | { kind: "reconnecting" }
  | { kind: "gone"; message: string };

export type SocketLike = Pick<WebSocket, "onopen" | "onmessage" | "onclose" | "send" | "close">;

export interface RoomDeps {
  connect(): SocketLike;
  prefs: Prefs;
  puzzle(id: string): Puzzle | undefined;
  clock(): number;
  /** where seat tokens live: per tab, so a reload keeps the seat and a second tab gets its own */
  seats: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  /** the room has an id: put it in the address */
  onRoom(id: string): void;
  reload(): void;
}

const seatKey = (room: string) => `yank-wars:seat:${room}`;

export class RoomClient {
  view = $state.raw<RoomView | null>(null);
  /** clock time the view arrived: its durations count down from here */
  viewAt = $state(0);
  seat = $state<Seat | null>(null);
  connection = $state.raw<Connection>({ kind: "connecting" });
  ctl = $state.raw<RoundController | null>(null);
  /** the most grace this round has had left, for the grace bar's scale */
  graceMax = $state(0);

  readonly #deps: RoomDeps;
  #room: string | undefined;
  #token: string | undefined;
  #ws: SocketLike | null = null;
  #tries = 0;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #left = false;
  /** entries of this round's log the server has, or was sent on the open socket */
  #sent = 0;
  #log: KeyLog = [];
  #flush: ReturnType<typeof setTimeout> | undefined;
  #lastFlush = -Infinity;

  constructor(room: string | undefined, deps: RoomDeps) {
    this.#deps = deps;
    this.#room = room;
    try {
      this.#token =
        room === undefined ? undefined : (deps.seats?.getItem(seatKey(room)) ?? undefined);
    } catch {}
    this.#open();
  }

  get me() {
    return this.seat === null ? null : (this.view?.players[this.seat] ?? null);
  }

  get them() {
    return this.seat === null ? null : (this.view?.players[1 - this.seat] ?? null);
  }

  /** ms of grace left at clock time `now`, or null before anyone locked in */
  graceLeft(now: number): number | null {
    const g = this.view?.graceLeft ?? null;
    return g === null ? null : Math.max(0, g - (now - this.viewAt));
  }

  lobby(change: { ready?: boolean; name?: string }): void {
    const me = this.me;
    if (me === null || this.view?.phase !== "lobby") return;
    this.#send({ t: "lobby", ready: change.ready ?? me.lobbyReady, ...change });
  }

  rematch(): void {
    this.#send({ t: "rematch" });
  }

  /** Leaves for good: no reconnect, and the seat token is forgotten. */
  leave(): void {
    this.#left = true;
    clearTimeout(this.#retry);
    clearTimeout(this.#flush);
    if (this.#room !== undefined) {
      try {
        this.#deps.seats?.removeItem(seatKey(this.#room));
      } catch {}
    }
    this.#ws?.close();
    this.#ws = null;
    this.ctl?.destroy();
  }

  #open(): void {
    const ws = this.#deps.connect();
    this.#ws = ws;
    ws.onopen = () => {
      this.#send({
        t: "hello",
        ...(this.#room === undefined ? {} : { room: this.#room }),
        ...(this.#token === undefined ? {} : { seat: this.#token }),
        name: this.#deps.prefs.name,
      });
    };
    ws.onmessage = (e) => this.#frame(JSON.parse(String(e.data)) as ServerFrame);
    ws.onclose = () => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      this.#closed();
    };
  }

  #closed(): void {
    if (this.#left || this.connection.kind === "gone") return;
    if (this.#token === undefined || this.#room === undefined) {
      this.connection = { kind: "gone", message: "Can't reach the server." };
      return;
    }
    const wait = RECONNECT_MS[this.#tries++];
    if (wait === undefined) {
      this.connection = { kind: "gone", message: "Lost the connection to the room." };
      return;
    }
    this.connection = { kind: "reconnecting" };
    this.#retry = setTimeout(() => this.#open(), wait);
  }

  /** Only a hello goes out before the welcome. */
  #send(frame: Record<string, unknown>): boolean {
    if (this.#ws === null || (frame.t !== "hello" && this.connection.kind !== "open")) return false;
    this.#ws.send(JSON.stringify({ v: PROTOCOL, ...frame }));
    return true;
  }

  #frame(f: ServerFrame): void {
    switch (f.t) {
      case "welcome":
        this.#welcome(f);
        return;
      case "state":
        this.#state(f.state);
        return;
      case "verdict":
        if (f.round === this.view?.round) this.ctl?.verdict(f.ok);
        return;
      case "error":
        this.connection = {
          kind: "gone",
          message:
            f.code === "no such room"
              ? "This room is closed. Rooms end when the server restarts, and 5 minutes after both players leave."
              : f.code === "room full"
                ? "This room already has two players."
                : `The server refused a frame: ${f.message}`,
        };
        return;
      case "reload":
        this.#deps.reload();
        return;
    }
  }

  #welcome(f: Extract<ServerFrame, { t: "welcome" }>): void {
    const fresh = this.#room === undefined;
    this.#room = f.state.room;
    this.#token = f.token;
    this.seat = f.seat;
    this.#tries = 0;
    this.connection = { kind: "open" };
    try {
      this.#deps.seats?.setItem(seatKey(f.state.room), f.token);
    } catch {}
    if (fresh) this.#deps.onRoom(f.state.room);
    const sameRound = this.ctl !== null && this.view?.round === f.state.round;
    this.#state(f.state);
    const ctl = this.ctl;
    if (ctl === null) return;
    // A reload starts with an empty buffer: type the room's copy of the log into it.
    if (!sameRound) ctl.restore(f.log);
    this.#sent = f.log.length;
    this.#sendKeys();
    const me = this.me;
    if (me?.status === "claiming" || me?.status === "locked") ctl.claim = "checking";
    if (me?.status === "locked") ctl.verdict(true, me.lockedAfter);
    else if (me?.status === "playing") ctl.reclaim();
  }

  #state(view: RoomView): void {
    const prev = this.view;
    this.view = view;
    this.viewAt = this.#deps.clock();
    const round = prev?.round !== view.round || this.ctl === null;
    if (view.phase === "lobby") {
      this.#drop();
      return;
    }
    if (round && view.puzzleId !== null && (view.phase === "study" || view.phase === "playing")) {
      this.#startRound(view);
    }
    const ctl = this.ctl;
    if (ctl === null) return;
    if (view.graceLeft === null) this.graceMax = 0;
    else this.graceMax = Math.max(this.graceMax, view.graceLeft);
    const me = this.me;
    if (view.phase === "playing" && view.elapsed !== null && view.phaseLeft !== null) {
      ctl.sync(view.elapsed, view.phaseLeft);
    }
    if (me?.status === "locked") ctl.verdict(true, me.lockedAfter);
    if (view.phase === "results" || me?.status === "forfeited") ctl.stop();
  }

  #startRound(view: RoomView): void {
    this.#drop();
    const puzzle = this.#deps.puzzle(view.puzzleId as string);
    if (puzzle === undefined) {
      this.connection = {
        kind: "gone",
        message: `This page doesn't have the room's puzzle (${view.puzzleId}): reload it.`,
      };
      return;
    }
    this.#sent = 0;
    this.#log = [];
    this.graceMax = 0;
    const study = view.phase === "study" ? (view.phaseLeft ?? 0) : 0;
    this.ctl = new RoundController(puzzle, this.#deps.prefs, this.#deps.clock, this.#link, study);
  }

  #drop(): void {
    clearTimeout(this.#flush);
    this.#flush = undefined;
    this.ctl?.destroy();
    this.ctl = null;
  }

  readonly #link: RoundLink = {
    ready: () => {
      this.#send({ t: "ready" });
    },
    log: (log) => {
      this.#log = log;
      this.#scheduleKeys();
    },
    claim: (length, doc) => {
      this.#sendKeys();
      this.#send({ t: "claim", round: this.view?.round, length, doc });
    },
    forfeit: () => {
      this.#sendKeys();
      this.#send({ t: "forfeit", round: this.view?.round });
    },
  };

  #scheduleKeys(): void {
    if (this.#flush !== undefined) return;
    const wait = this.#lastFlush + SEND_MS - this.#deps.clock();
    if (wait <= 0) this.#sendKeys();
    else this.#flush = setTimeout(() => this.#sendKeys(), wait);
  }

  #sendKeys(): void {
    clearTimeout(this.#flush);
    this.#flush = undefined;
    const round = this.view?.round;
    while (this.#sent < this.#log.length && round !== undefined) {
      const entries = this.#log.slice(this.#sent, this.#sent + BATCH);
      if (!this.#send({ t: "keys", round, from: this.#sent, entries })) return;
      this.#sent += entries.length;
      this.#lastFlush = this.#deps.clock();
    }
  }
}
