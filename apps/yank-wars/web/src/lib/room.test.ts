import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import {
  type LogEntry,
  type PlayerView,
  parseKeys,
  parsePuzzle,
  RESET,
  type RoomView,
  type ServerFrame,
} from "@yank-wars/engine";
import { Prefs } from "./prefs.svelte.ts";
import { RECONNECT_MS, RoomClient, SEND_MS, type SocketLike } from "./room.svelte.ts";

const ROOM = "abcdefghij";
const TOKEN = "0123456789abcdef0123456789abcdef";

const puzzle = parsePuzzle({
  id: "room-flow",
  title: "Room flow",
  difficulty: "easy",
  language: "text",
  tabSize: 2,
  indentUnit: "  ",
  start: "one two three",
  target: "two three",
  solution: "dw",
  source: { kind: "original", author: "yank-wars" },
});

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

class FakeSocket {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  sent: Record<string, unknown>[] = [];
  send(text: string): void {
    this.sent.push(JSON.parse(text));
  }
  close(): void {
    this.onclose?.({});
  }
  open(): void {
    this.onopen?.({});
  }
  receive(f: ServerFrame): void {
    this.onmessage?.({ data: JSON.stringify(f) });
  }
  /** what went out, without the protocol version */
  take(): Record<string, unknown>[] {
    return this.sent.splice(0).map(({ v: _, ...f }) => f);
  }
}

const player = (name: string, over: Partial<PlayerView> = {}): PlayerView => ({
  name,
  connected: true,
  lobbyReady: false,
  rematch: false,
  status: "waiting",
  score: 0,
  runs: 1,
  lockedAfter: null,
  ...over,
});

const view = (over: Partial<RoomView> = {}): RoomView => ({
  room: ROOM,
  phase: "lobby",
  round: 0,
  puzzleId: null,
  difficulty: "easy",
  players: [player("ada"), player("bob")],
  tally: [0, 0],
  phaseLeft: null,
  elapsed: null,
  graceLeft: null,
  last: null,
  ...over,
});

const studying = (round = 1) =>
  view({ phase: "study", round, puzzleId: puzzle.id, phaseLeft: 5_000 });
const playing = (elapsed = 0, me: Partial<PlayerView> = { status: "playing" }) =>
  view({
    phase: "playing",
    round: 1,
    puzzleId: puzzle.id,
    phaseLeft: 240_000 - elapsed,
    elapsed,
    players: [player("ada", me), player("bob", { status: "playing" })],
  });

let t = 1_000;
let sockets: FakeSocket[] = [];
let rooms: string[] = [];
let frames: FrameRequestCallback[] = [];
const cleanup: (() => void)[] = [];
const g = globalThis as unknown as Record<string, unknown>;
const saved = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };

beforeEach(() => {
  t = 1_000;
  sockets = [];
  rooms = [];
  frames = [];
  g.requestAnimationFrame = (f: FrameRequestCallback) => frames.push(f);
  g.cancelAnimationFrame = () => {};
  jest.useFakeTimers();
});

afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  jest.useRealTimers();
  g.requestAnimationFrame = saved.raf;
  g.cancelAnimationFrame = saved.caf;
});

function client(room?: string, seats = new MemoryStorage()) {
  const storage = new MemoryStorage();
  const prefs = new Prefs(storage);
  prefs.name = "ada";
  const c = new RoomClient(room, {
    connect: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as SocketLike;
    },
    prefs,
    puzzle: (id) => (id === puzzle.id ? puzzle : undefined),
    clock: () => t,
    seats,
    onRoom: (id) => rooms.push(id),
    reload: () => {},
  });
  cleanup.push(() => c.leave());
  return { c, seats, ws: () => sockets.at(-1) as FakeSocket };
}

/** Mounts the room's current round and returns a key presser for its editor. */
function mount(c: RoomClient) {
  const ctl = c.ctl;
  if (ctl === null) throw new Error("no round");
  const host = document.createElement("div");
  const player = document.createElement("section");
  const target = document.createElement("section");
  host.append(player, target);
  document.body.append(host);
  ctl.mount(player, target);
  cleanup.push(() => host.remove());
  return {
    press(key: string) {
      const content = player.querySelector(".cm-content") as Element;
      content.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    },
    doc: () => player.querySelector(".cm-content")?.textContent ?? "",
  };
}

function joined(room?: string, seats?: MemoryStorage) {
  const r = client(room, seats);
  r.ws().open();
  r.ws().receive({ t: "welcome", seat: 0, token: TOKEN, state: view(), log: [] });
  r.ws().take();
  return r;
}

test("a new room: hello with the remembered name, then the id goes to the address and the seat token to the tab", () => {
  const { c, seats, ws } = client();
  ws().open();
  expect(ws().take()).toEqual([{ t: "hello", name: "ada" }]);
  ws().receive({
    t: "welcome",
    seat: 0,
    token: TOKEN,
    state: view({ players: [player("ada"), null] }),
    log: [],
  });
  expect([rooms, seats.getItem(`yank-wars:seat:${ROOM}`), c.connection]).toEqual([
    [ROOM],
    TOKEN,
    { kind: "open" },
  ]);
  c.lobby({ ready: true, name: "ada l" });
  c.lobby({ difficulty: "hard" });
  expect(ws().take()).toEqual([
    { t: "lobby", ready: true, name: "ada l" },
    { t: "lobby", ready: false, difficulty: "hard" },
  ]);
});

test("Space and the study clock ask the room to start; play starts on its word; keys go out at most every SEND_MS", () => {
  const { c, ws } = joined(ROOM);
  ws().receive({ t: "state", state: studying() });
  const keys = mount(c);
  keys.press(" ");
  expect([c.ctl?.phase, c.ctl?.readySent, ws().take()]).toEqual(["study", true, [{ t: "ready" }]]);
  keys.press("l");
  t += 6_000;
  for (const f of frames.splice(0)) f(t);
  expect([c.ctl?.phase, c.ctl?.keys, ws().take()]).toEqual(["study", 0, []]);
  ws().receive({ t: "state", state: playing() });
  expect(c.ctl?.phase).toBe("playing");
  keys.press("l");
  keys.press("h");
  expect(ws().take()).toEqual([{ t: "keys", round: 1, from: 0, entries: ["l"] }]);
  t += SEND_MS;
  jest.advanceTimersByTime(SEND_MS);
  expect(ws().take()).toEqual([{ t: "keys", round: 1, from: 1, entries: ["h"] }]);
});

test("a match is a claim: keys stop until the verdict; a rejection lets play go on, a yes locks in", () => {
  const { c, ws } = joined(ROOM);
  ws().receive({ t: "state", state: studying() });
  const keys = mount(c);
  ws().receive({ t: "state", state: playing() });
  keys.press("d");
  t += SEND_MS;
  keys.press("w");
  expect(ws().take()).toEqual([
    { t: "keys", round: 1, from: 0, entries: ["d"] },
    { t: "keys", round: 1, from: 1, entries: ["w"] },
    { t: "claim", round: 1, length: 2, doc: "two three" },
  ]);
  keys.press("x");
  expect([c.ctl?.claim, c.ctl?.keys, keys.doc()]).toEqual(["checking", 2, "two three"]);
  ws().receive({ t: "verdict", round: 1, ok: false, reason: "mismatch" });
  expect(c.ctl?.claim).toBe("rejected");
  t += SEND_MS;
  keys.press("x");
  expect([c.ctl?.claim, c.ctl?.keys, ws().take()]).toEqual([
    "none",
    3,
    [{ t: "keys", round: 1, from: 2, entries: ["x"] }],
  ]);
  t += SEND_MS;
  keys.press("u");
  expect(ws().take().at(-1)).toEqual({ t: "claim", round: 1, length: 4, doc: "two three" });
  ws().receive({ t: "verdict", round: 1, ok: true, score: 4 });
  expect([c.ctl?.phase, c.ctl?.claim]).toEqual(["locked", "none"]);
});

test("a dropped socket comes back with the seat token and resends what the server missed", () => {
  const { c, ws } = joined(ROOM);
  ws().receive({ t: "state", state: studying() });
  const keys = mount(c);
  ws().receive({ t: "state", state: playing() });
  keys.press("l");
  const first = ws();
  first.close();
  expect(c.connection).toEqual({ kind: "reconnecting" });
  t += SEND_MS;
  keys.press("l");
  jest.advanceTimersByTime(RECONNECT_MS[0] as number);
  expect(sockets.length).toBe(2);
  ws().open();
  expect(ws().take()).toEqual([{ t: "hello", room: ROOM, seat: TOKEN, name: "ada" }]);
  ws().receive({ t: "welcome", seat: 0, token: TOKEN, state: playing(2_000), log: parseKeys("l") });
  expect([c.connection, c.ctl?.keys, ws().take()]).toEqual([
    { kind: "open" },
    2,
    [{ t: "keys", round: 1, from: 1, entries: ["l"] }],
  ]);
});

test("a reconnect that never gets through gives the room up after the last retry", () => {
  const { c, ws } = joined(ROOM);
  ws().close();
  for (const wait of RECONNECT_MS) {
    expect(c.connection).toEqual({ kind: "reconnecting" });
    jest.advanceTimersByTime(wait);
    ws().close();
  }
  expect([sockets.length, c.connection]).toEqual([
    1 + RECONNECT_MS.length,
    { kind: "gone", message: "Lost the connection to the room." },
  ]);
});

test("a reload takes the seat back and types the room's copy of the log into the buffer", () => {
  const seats = new MemoryStorage();
  seats.setItem(`yank-wars:seat:${ROOM}`, TOKEN);
  const { c, ws } = client(ROOM, seats);
  ws().open();
  expect(ws().take()).toEqual([{ t: "hello", room: ROOM, seat: TOKEN, name: "ada" }]);
  const log: LogEntry[] = [...parseKeys("x"), RESET, ...parseKeys("xd")];
  ws().receive({ t: "welcome", seat: 0, token: TOKEN, state: playing(30_000), log });
  const keys = mount(c);
  expect([c.ctl?.phase, c.ctl?.keys, c.ctl?.round.runs, c.ctl?.elapsed, keys.doc()]).toEqual([
    "playing",
    2,
    2,
    30_000,
    "ne two three",
  ]);
  expect(ws().take()).toEqual([]);
  keys.press("w");
  expect(ws().take()).toEqual([
    { t: "keys", round: 1, from: 4, entries: ["w"] },
    { t: "claim", round: 1, length: 5, doc: "two three" },
  ]);
});

test("a reload whose buffer already matched claims again once it mounts", () => {
  const seats = new MemoryStorage();
  seats.setItem(`yank-wars:seat:${ROOM}`, TOKEN);
  const { c, ws } = client(ROOM, seats);
  ws().open();
  ws().receive({
    t: "welcome",
    seat: 0,
    token: TOKEN,
    state: playing(9_000),
    log: parseKeys("dw"),
  });
  ws().take();
  mount(c);
  expect([c.ctl?.claim, ws().take()]).toEqual([
    "checking",
    [{ t: "claim", round: 1, length: 2, doc: "two three" }],
  ]);
});

test("a reload during the server's check waits for its verdict; one after a lock-in shows it", () => {
  const seats = new MemoryStorage();
  seats.setItem(`yank-wars:seat:${ROOM}`, TOKEN);
  const a = client(ROOM, seats);
  a.ws().open();
  const state = playing(9_000, { status: "claiming", score: 2 });
  a.ws().receive({ t: "welcome", seat: 0, token: TOKEN, state, log: parseKeys("dw") });
  expect(a.c.ctl?.claim).toBe("checking");
  a.ws().receive({ t: "verdict", round: 1, ok: true, score: 2 });
  expect(a.c.ctl?.phase).toBe("locked");
  const b = client(ROOM, seats);
  b.ws().open();
  const locked = playing(9_000, { status: "locked", score: 2, lockedAfter: 8_000 });
  b.ws().receive({ t: "welcome", seat: 0, token: TOKEN, state: locked, log: parseKeys("dw") });
  expect([b.c.ctl?.phase, b.c.ctl?.elapsed]).toEqual(["locked", 8_000]);
});

test("the room's end stops a round still running; a closed room says why", () => {
  const { c, ws } = joined(ROOM);
  ws().receive({ t: "state", state: studying() });
  ws().receive({ t: "state", state: playing() });
  const winner = { round: 1, puzzleId: puzzle.id, winner: 1 as const };
  ws().receive({ t: "state", state: view({ phase: "results", round: 1, last: winner }) });
  expect(c.ctl?.phase).toBe("expired");
  const late = client("zzzzzzzzzz");
  late.ws().open();
  late.ws().receive({ t: "error", code: "no such room", message: "this room is closed" });
  expect(late.c.connection.kind === "gone" && late.c.connection.message).toStartWith(
    "This room is closed.",
  );
});
