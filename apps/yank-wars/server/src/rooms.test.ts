import { afterAll, describe, expect, test } from "bun:test";
import { upgrade } from "@sammysul/lsel/server";
import { parseKeys, parsePuzzle, type ServerFrame } from "@yank-wars/engine";
import { Replayer } from "./replay.ts";
import { type Conn, type Mismatch, Rooms } from "./rooms.ts";

const probe = parsePuzzle({
  id: "probe",
  title: "probe",
  difficulty: "easy",
  language: "text",
  tabSize: 4,
  indentUnit: "    ",
  start: "one two\nthree",
  target: "one\nthree",
  solution: "wDx",
  source: { kind: "original", author: "yank-wars" },
});

const replayer = new Replayer(1_000);
const mismatches: Mismatch[] = [];
const rooms = new Rooms({
  puzzles: new Map([["probe", probe]]),
  pick: () => "probe",
  verify: (p, log) => replayer.verify(p, log),
  mismatch: (m) => mismatches.push(m),
});
const socket = rooms.socket();
const server = Bun.serve<Conn>({
  port: 0,
  fetch: (req, srv) => upgrade(socket, req, srv),
  websocket: socket.handler,
});
afterAll(() => {
  rooms.close();
  replayer.close();
  server.stop(true);
});

/** A test client that keeps every frame and waits for the first one, after the last taken, that matches. */
class Client {
  readonly frames: ServerFrame[] = [];
  closed: { code: number; reason: string } | null = null;
  #seen = 0;
  #wake: (() => void) | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.onmessage = (e) => {
      this.frames.push(JSON.parse(String(e.data)) as ServerFrame);
      this.#wake?.();
    };
    ws.onclose = (e) => {
      this.closed = { code: e.code, reason: e.reason };
      this.#wake?.();
    };
  }

  static open(): Promise<Client> {
    const ws = new WebSocket(`ws://${server.hostname}:${server.port}/ws`);
    return new Promise((resolve) => {
      ws.onopen = () => resolve(new Client(ws));
    });
  }

  send(frame: Record<string, unknown>): void {
    this.ws.send(JSON.stringify({ v: 1, ...frame }));
  }

  async next<T extends ServerFrame>(match: (f: ServerFrame) => f is T): Promise<T>;
  async next(match: (f: ServerFrame) => boolean): Promise<ServerFrame>;
  async next(match: (f: ServerFrame) => boolean): Promise<ServerFrame> {
    for (;;) {
      while (this.#seen < this.frames.length) {
        const f = this.frames[this.#seen++] as ServerFrame;
        if (match(f)) return f;
      }
      if (this.closed !== null) throw new Error(`closed ${this.closed.code} ${this.closed.reason}`);
      await new Promise<void>((r) => {
        this.#wake = r;
      });
    }
  }

  welcome() {
    return this.next((f): f is Extract<ServerFrame, { t: "welcome" }> => f.t === "welcome");
  }

  /** The next state frame whose room view passes `ok`. */
  state(ok: (s: Extract<ServerFrame, { t: "state" }>["state"]) => boolean) {
    return this.next((f) => f.t === "state" && ok(f.state)) as Promise<
      Extract<ServerFrame, { t: "state" }>
    >;
  }
}

/** Two clients in one room, both past the study window. */
async function playing() {
  const a = await Client.open();
  a.send({ t: "hello", name: "ada" });
  const wa = await a.welcome();
  const b = await Client.open();
  b.send({ t: "hello", room: wa.state.room, name: "bob" });
  const wb = await b.welcome();
  a.send({ t: "lobby", ready: true });
  b.send({ t: "lobby", ready: true });
  await a.state((s) => s.phase === "study");
  a.send({ t: "ready" });
  b.send({ t: "ready" });
  await b.state((s) => s.phase === "playing");
  return { a, b, room: wa.state.room, tokenA: wa.token, seats: [wa.seat, wb.seat] };
}

describe("a room over real sockets", () => {
  test("two players race: a verified lock-in, a forfeit, the result and the tally", async () => {
    const { a, b, seats } = await playing();
    expect(seats).toEqual([0, 1]);
    a.send({ t: "keys", round: 1, from: 0, entries: parseKeys("wDx") });
    a.send({ t: "claim", round: 1, length: 3, doc: "one\nthree" });
    expect(await a.next((f) => f.t === "verdict")).toEqual({
      t: "verdict",
      round: 1,
      ok: true,
      score: 3,
    });
    const seen = await b.state((s) => s.players[0]?.status === "locked");
    expect([seen.state.players[0]?.score, seen.state.graceLeft !== null]).toEqual([3, true]);
    b.send({ t: "forfeit", round: 1 });
    const end = await a.state((s) => s.phase === "results");
    expect([end.state.last, end.state.tally]).toEqual([
      { round: 1, puzzleId: "probe", winner: 0 },
      [1, 0],
    ]);
    a.ws.close();
    b.ws.close();
  });

  test("a claim the replay disagrees with is refused and reported; the round goes on", async () => {
    const { a, b, room } = await playing();
    a.send({ t: "keys", round: 1, from: 0, entries: parseKeys("wD") });
    a.send({ t: "claim", round: 1, length: 2, doc: "one\nthree" });
    expect(await a.next((f) => f.t === "verdict")).toEqual({
      t: "verdict",
      round: 1,
      ok: false,
      reason: "mismatch",
    });
    expect(mismatches.at(-1)).toMatchObject({
      room,
      round: 1,
      puzzleId: "probe",
      log: parseKeys("wD"),
      clientDoc: "one\nthree",
      replay: { ok: false, reason: "mismatch", doc: "one \nthree" },
    });
    await a.state((s) => s.players[0]?.status === "playing");
    a.ws.close();
    b.ws.close();
  });

  test("a dropped player takes the seat back with the token and gets its log", async () => {
    const { a, b, room, tokenA } = await playing();
    a.send({ t: "keys", round: 1, from: 0, entries: parseKeys("wD") });
    await b.state((s) => s.players[0]?.score === 2);
    a.ws.close();
    await b.state((s) => s.players[0]?.connected === false);
    const again = await Client.open();
    again.send({ t: "hello", room, seat: tokenA, name: "ada" });
    const w = await again.welcome();
    expect([w.seat, w.token, w.state.players[0]?.connected]).toEqual([0, tokenA, true]);
    expect(w.log).toEqual(parseKeys("wD"));
    again.ws.close();
    b.ws.close();
  });

  test("a third player, a closed room, a bad frame and an old client are turned away", async () => {
    const { a, b, room } = await playing();
    const c = await Client.open();
    c.send({ t: "hello", room, name: "eve" });
    expect(await c.next((f) => f.t === "error")).toMatchObject({ code: "room full" });
    const d = await Client.open();
    d.send({ t: "hello", room: "zzzzzzzzzz", name: "eve" });
    expect(await d.next((f) => f.t === "error")).toMatchObject({ code: "no such room" });
    a.send({ t: "keys", round: 1, from: 0, entries: ["not a key"] });
    expect(await a.next((f) => f.t === "error")).toEqual({
      t: "error",
      code: "bad frame",
      message: "entries.0: not a key or reset marker",
    });
    b.ws.send(JSON.stringify({ v: 0, t: "ready" }));
    expect(await b.next((f) => f.t === "reload")).toEqual({ t: "reload" });
  });
});
