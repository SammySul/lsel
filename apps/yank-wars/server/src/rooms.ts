// Rooms in memory: sockets, timers and replays around the pure rules in room.ts.
import type { Socket } from "@sammysul/lsel/server";
import {
  type ClientFrame,
  type KeyLog,
  LIMITS,
  type Puzzle,
  parseClientFrame,
  type Seat,
  type ServerFrame,
} from "@yank-wars/engine";
import type { ServerWebSocket } from "bun";
import type { Verdict } from "./replay.ts";
import {
  createRoom,
  type Effect,
  nameOf,
  nextWake,
  type Pick,
  type Room,
  type RoomEvent,
  reduceRoom,
  viewOf,
} from "./room.ts";

export const ROOMS = {
  /** a room with nobody connected closes after this long */
  idleMs: 5 * 60_000,
  /** state frames per room at most this often */
  broadcastMs: 100,
} as const;

export interface Mismatch {
  at: string;
  room: string;
  round: number;
  puzzleId: string;
  log: KeyLog;
  clientDoc: string;
  replay: Verdict;
}

export interface Deps {
  puzzles: ReadonlyMap<string, Puzzle>;
  pick: Pick;
  verify: (puzzle: Puzzle, log: KeyLog) => Promise<Verdict>;
  mismatch: (m: Mismatch) => void;
  now?: () => number;
  /** random bytes, for room ids and seat tokens */
  random?: (n: number) => Uint8Array;
}

export interface Conn {
  room: string | null;
  seat: Seat | null;
  windowStart: number;
  frames: number;
  /** the client's buffer from its last claim, for a mismatch report */
  claimDoc: string;
}

type Ws = ServerWebSocket<Conn>;

interface Live {
  room: Room;
  sockets: [Ws | null, Ws | null];
  tokens: [string | null, string | null];
  wake: ReturnType<typeof setTimeout> | undefined;
  idle: ReturnType<typeof setTimeout> | undefined;
  lastSent: number;
  pending: ReturnType<typeof setTimeout> | undefined;
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const SEATS: readonly Seat[] = [0, 1];

export class Rooms {
  readonly #deps: Required<Deps>;
  readonly #live = new Map<string, Live>();

  constructor(deps: Deps) {
    this.#deps = {
      now: Date.now,
      random: (n) => crypto.getRandomValues(new Uint8Array(n)),
      ...deps,
    };
  }

  get size(): number {
    return this.#live.size;
  }

  socket(path = "/ws"): Socket<Conn> {
    return {
      path,
      data: () => ({ room: null, seat: null, windowStart: 0, frames: 0, claimDoc: "" }),
      handler: {
        message: (ws, msg) => this.#message(ws, String(msg)),
        close: (ws) => this.#close(ws),
      },
    };
  }

  /** Every timer stops; for tests and shutdown. */
  close(): void {
    for (const live of this.#live.values()) this.#stopTimers(live);
    this.#live.clear();
  }

  #send(ws: Ws | null, frame: ServerFrame): void {
    ws?.send(JSON.stringify(frame));
  }

  #message(ws: Ws, text: string): void {
    const now = this.#deps.now();
    if (now - ws.data.windowStart >= 1_000) {
      ws.data.windowStart = now;
      ws.data.frames = 0;
    }
    if (++ws.data.frames > LIMITS.framesPerSecond) {
      ws.close(1008, "too many frames");
      return;
    }
    const r = parseClientFrame(text);
    if (!r.ok) {
      if (r.stale) this.#send(ws, { t: "reload" });
      else this.#send(ws, { t: "error", code: "bad frame", message: r.error });
      ws.close(1008, r.stale ? "stale client" : "bad frame");
      return;
    }
    if (r.frame.t === "hello") this.#hello(ws, r.frame);
    else this.#frame(ws, r.frame);
  }

  #id(bytes: number, alphabet: (b: number) => string): string {
    return [...this.#deps.random(bytes)].map(alphabet).join("");
  }

  #hello(ws: Ws, f: Extract<ClientFrame, { t: "hello" }>): void {
    if (ws.data.room !== null) return;
    const name = nameOf(f.name);
    let live: Live | undefined;
    if (f.room === undefined) {
      const id = this.#id(10, (b) => BASE32[b % 32] as string);
      live = {
        room: createRoom(id),
        sockets: [null, null],
        tokens: [null, null],
        wake: undefined,
        idle: undefined,
        lastSent: 0,
        pending: undefined,
      };
      this.#live.set(id, live);
    } else {
      live = this.#live.get(f.room);
      if (live === undefined) {
        this.#send(ws, { t: "error", code: "no such room", message: "this room is closed" });
        ws.close(1000, "no such room");
        return;
      }
    }
    const back = SEATS.find((s) => f.seat !== undefined && live.tokens[s] === f.seat);
    const seat =
      back ?? SEATS.find((s) => live.room.players[s] === null && live.tokens[s] === null);
    if (seat === undefined || (back === undefined && live.room.phase !== "lobby")) {
      this.#send(ws, {
        t: "error",
        code: "room full",
        message: "this room already has two players",
      });
      ws.close(1000, "room full");
      return;
    }
    const old = live.sockets[seat];
    if (old !== null && old !== ws) {
      old.data.room = null;
      old.close(1000, "replaced");
    }
    const token =
      back === undefined ? this.#id(16, (b) => b.toString(16).padStart(2, "0")) : f.seat;
    live.tokens[seat] = token as string;
    clearTimeout(live.idle);
    live.idle = undefined;
    // Joined before its socket is listed, so the welcome is the first frame it gets.
    this.#dispatch(
      live,
      back === undefined ? { type: "join", seat, name } : { type: "rejoin", seat },
    );
    live.sockets[seat] = ws;
    ws.data.room = live.room.id;
    ws.data.seat = seat;
    this.#send(ws, {
      t: "welcome",
      seat,
      token: token as string,
      state: viewOf(live.room, this.#deps.now()),
      log: [...(live.room.players[seat]?.log ?? [])],
    });
  }

  #frame(ws: Ws, f: Exclude<ClientFrame, { t: "hello" }>): void {
    const live = ws.data.room === null ? undefined : this.#live.get(ws.data.room);
    const seat = ws.data.seat;
    if (live === undefined || seat === null || live.sockets[seat] !== ws) return;
    if (f.t === "claim") ws.data.claimDoc = f.doc;
    this.#dispatch(live, eventOf(f, seat));
  }

  #close(ws: Ws): void {
    const live = ws.data.room === null ? undefined : this.#live.get(ws.data.room);
    const seat = ws.data.seat;
    if (live === undefined || seat === null || live.sockets[seat] !== ws) return;
    live.sockets[seat] = null;
    this.#dispatch(live, { type: "drop", seat });
    if (live.sockets.every((s) => s === null)) {
      live.idle = setTimeout(() => this.#end(live), ROOMS.idleMs);
    }
  }

  #end(live: Live): void {
    this.#stopTimers(live);
    this.#live.delete(live.room.id);
  }

  #stopTimers(live: Live): void {
    clearTimeout(live.wake);
    clearTimeout(live.idle);
    clearTimeout(live.pending);
  }

  #dispatch(live: Live, e: RoomEvent): void {
    const now = this.#deps.now();
    const { room, effects } = reduceRoom(live.room, e, now, this.#deps.pick);
    const changed = room !== live.room;
    live.room = room;
    for (const s of SEATS) if (room.players[s] === null) live.tokens[s] = null;
    for (const fx of effects) this.#effect(live, fx);
    this.#schedule(live);
    if (changed) this.#broadcast(live);
  }

  #effect(live: Live, fx: Effect): void {
    if (fx.type === "refuse") {
      this.#send(live.sockets[fx.seat], {
        t: "verdict",
        round: fx.round,
        ok: false,
        reason: fx.reason,
      });
      return;
    }
    const puzzle = this.#deps.puzzles.get(fx.puzzleId);
    if (puzzle === undefined) throw new Error(`no puzzle ${fx.puzzleId}`);
    const clientDoc = live.sockets[fx.seat]?.data.claimDoc ?? "";
    void this.#deps.verify(puzzle, fx.log).then((v) => {
      if (this.#live.get(live.room.id) !== live) return;
      if (!v.ok && v.reason === "mismatch") {
        this.#deps.mismatch({
          at: new Date(this.#deps.now()).toISOString(),
          room: live.room.id,
          round: fx.round,
          puzzleId: fx.puzzleId,
          log: fx.log,
          clientDoc,
          replay: v,
        });
      }
      this.#send(
        live.sockets[fx.seat],
        v.ok
          ? { t: "verdict", round: fx.round, ok: true, score: v.score }
          : { t: "verdict", round: fx.round, ok: false, reason: v.reason },
      );
      this.#dispatch(
        live,
        v.ok
          ? { type: "verdict", seat: fx.seat, round: fx.round, ok: true, score: v.score }
          : { type: "verdict", seat: fx.seat, round: fx.round, ok: false },
      );
    });
  }

  #schedule(live: Live): void {
    clearTimeout(live.wake);
    const at = nextWake(live.room);
    if (at === null) return;
    live.wake = setTimeout(
      () => this.#dispatch(live, { type: "tick" }),
      Math.max(0, at - this.#deps.now()),
    );
  }

  #broadcast(live: Live): void {
    if (live.pending !== undefined) return;
    const wait = live.lastSent + ROOMS.broadcastMs - this.#deps.now();
    const send = () => {
      live.pending = undefined;
      live.lastSent = this.#deps.now();
      const frame: ServerFrame = { t: "state", state: viewOf(live.room, live.lastSent) };
      for (const ws of live.sockets) this.#send(ws, frame);
    };
    if (wait <= 0) send();
    else live.pending = setTimeout(send, wait);
  }
}

function eventOf(f: Exclude<ClientFrame, { t: "hello" }>, seat: Seat): RoomEvent {
  switch (f.t) {
    case "lobby":
      return { type: "lobby", seat, ready: f.ready, difficulty: f.difficulty, name: f.name };
    case "ready":
      return { type: "ready", seat };
    case "keys":
      return { type: "keys", seat, round: f.round, from: f.from, entries: f.entries };
    case "claim":
      return { type: "claim", seat, round: f.round, length: f.length };
    case "forfeit":
      return { type: "forfeit", seat, round: f.round };
    case "rematch":
      return { type: "rematch", seat };
  }
}
