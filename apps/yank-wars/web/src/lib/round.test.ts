import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { type KeyLog, RESET } from "@yank-wars/engine";
import { playablePuzzle } from "@yank-wars/engine/oracle/engine";
import { Prefs } from "./prefs.svelte.ts";
import { LOCK_PULSE_MS, RoundController } from "./round.svelte.ts";

const STUDY_MS = 5_000;
const CAP_MS = 240_000;
const T0 = 1_000;

const puzzle = playablePuzzle("one two three", "two three", "dw", {
  id: "round-flow",
  language: "javascript",
});

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

// One clock read can be scripted, to land a key's acceptance before the cap and its feed after.
let t = T0;
let nextReads: number[] = [];
const clock = () => nextReads.shift() ?? t;

let frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
const g = globalThis as unknown as Record<string, unknown>;
const saved = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };

interface Rig {
  ctl: RoundController;
  storage: MemoryStorage;
  host: HTMLElement;
  press(key: string, init?: KeyboardEventInit): KeyboardEvent;
  doc(): string;
  frame(): void;
}
const rigs: Rig[] = [];

function rig(storage = new MemoryStorage()): Rig {
  const host = document.createElement("div");
  const playerHost = document.createElement("section");
  const targetHost = document.createElement("section");
  host.append(playerHost, targetHost);
  document.body.append(host);
  const ctl = new RoundController(puzzle, new Prefs(storage), clock);
  ctl.mount(playerHost, targetHost);
  const content = () => {
    const el = playerHost.querySelector(".cm-content");
    if (el === null) throw new Error("no player editor mounted");
    return el;
  };
  const r: Rig = {
    ctl,
    storage,
    host,
    press(key, init = {}) {
      const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      content().dispatchEvent(e);
      return e;
    },
    doc: () => content().textContent ?? "",
    frame() {
      const due = [...frames.values()];
      frames = new Map();
      for (const f of due) f(clock());
    },
  };
  rigs.push(r);
  return r;
}

const logOf = (r: Rig): readonly string[] => r.ctl.round.log as KeyLog as readonly string[];

function playing(): Rig {
  const r = rig();
  r.press(" ");
  expect(r.ctl.phase).toBe("playing");
  return r;
}

beforeEach(() => {
  t = T0;
  nextReads = [];
  frames = new Map();
  g.requestAnimationFrame = (f: FrameRequestCallback) => {
    frames.set(++frameId, f);
    return frameId;
  };
  g.cancelAnimationFrame = (id: number) => frames.delete(id);
});

afterEach(() => {
  jest.useRealTimers();
  for (const r of rigs.splice(0)) {
    r.ctl.destroy();
    r.host.remove();
  }
  g.requestAnimationFrame = saved.raf;
  g.cancelAnimationFrame = saved.caf;
});

test("study swallows editing keys until Space, and the clock starts at the ready key", () => {
  const r = rig();
  expect(r.ctl.phase).toBe("study");
  for (const k of ["d", "w", "x"]) expect(r.press(k).defaultPrevented).toBe(true);
  expect(r.doc()).toBe("one two three");
  expect(r.ctl.keys).toBe(0);
  t = T0 + 1_200;
  r.press(" ");
  expect(r.ctl.phase).toBe("playing");
  expect(r.ctl.round.startedAt).toBe(T0 + 1_200);
  expect(r.ctl.round.endsAt).toBe(T0 + 1_200 + CAP_MS);
  expect(logOf(r)).toEqual([]);
});

test("Enter is a ready key too, but a held (repeating) Space is not", () => {
  const r = rig();
  r.press(" ", { repeat: true });
  expect(r.ctl.phase).toBe("study");
  r.press("Enter");
  expect(r.ctl.phase).toBe("playing");
  expect(r.ctl.keys).toBe(0);
});

test("the study phase ends on the frame at studyEndsAt, not before", () => {
  const r = rig();
  t = T0 + STUDY_MS - 1;
  r.frame();
  expect(r.ctl.phase).toBe("study");
  t = T0 + STUDY_MS;
  r.frame();
  expect(r.ctl.phase).toBe("playing");
  expect(r.ctl.round.startedAt).toBe(T0 + STUDY_MS);
});

test("the counter ticks once per key, including no-op and prompt keys", () => {
  const r = playing();
  const counts: number[] = [];
  for (const [key, init] of [
    ["l", {}],
    ["Escape", {}],
    [":", {}],
    ["Backspace", {}],
    ["u", {}],
  ] as const) {
    r.press(key, init);
    counts.push(r.ctl.keys);
  }
  expect(counts).toEqual([1, 2, 3, 4, 5]);
  expect(logOf(r)).toEqual(["l", "<Esc>", ":", "<BS>", "u"]);
});

test("<C-CR> resets: counter 0, run 2, fresh buffer, clock running, only the final run scored", () => {
  const r = playing();
  for (const k of ["x", "x", "x"]) r.press(k);
  expect(r.doc()).toBe(" two three");
  t = T0 + 3_000;
  const e = r.press("Enter", { ctrlKey: true });
  expect(e.defaultPrevented).toBe(true);
  expect(r.ctl.keys).toBe(0);
  expect(r.ctl.round.runs).toBe(2);
  expect(r.ctl.flash).toBe(1);
  expect(logOf(r)).toEqual(["x", "x", "x", RESET]);
  expect(r.doc()).toBe("one two three");
  expect(r.ctl.round.startedAt).toBe(T0);
  r.press("d");
  r.press("w");
  expect(r.ctl.phase).toBe("locked");
  expect(r.ctl.keys).toBe(2);
  expect(r.ctl.notation).toBe("dw");
  expect(r.ctl.prefs.best[puzzle.id]).toEqual({ keys: 2, ms: 3_000 });
});

test("<C-CR> outside play does nothing and is not logged", () => {
  const r = rig();
  r.press("Enter", { ctrlKey: true });
  expect(r.ctl.round.runs).toBe(1);
  expect(r.ctl.phase).toBe("study");
  expect(r.ctl.flash).toBe(0);
});

test("<C-S-CR> gives up; the card waits for a later task and nothing is recorded", async () => {
  jest.useFakeTimers();
  const r = playing();
  r.press("x");
  t = T0 + 7_000;
  r.press("Enter", { ctrlKey: true, shiftKey: true });
  expect(r.ctl.phase).toBe("forfeited");
  expect(r.ctl.round.finishedAt).toBe(T0 + 7_000);
  expect(r.ctl.showResult).toBe(false);
  jest.advanceTimersByTime(0);
  expect(r.ctl.showResult).toBe(true);
  expect(r.ctl.prefs.best[puzzle.id]).toBeUndefined();
  r.press("d");
  expect(logOf(r)).toEqual(["x"]);
  expect(r.doc()).toBe("ne two three");
});

test("the cap expires the round on the frame at endsAt, freezing elapsed at the cap", () => {
  jest.useFakeTimers();
  const r = playing();
  t = T0 + CAP_MS - 1;
  r.frame();
  expect(r.ctl.phase).toBe("playing");
  t = T0 + CAP_MS + 500;
  r.frame();
  expect(r.ctl.phase).toBe("expired");
  expect(r.ctl.round.finishedAt).toBe(T0 + CAP_MS);
  expect(r.ctl.elapsed).toBe(CAP_MS);
  expect(r.ctl.showResult).toBe(false);
  jest.advanceTimersByTime(0);
  expect(r.ctl.showResult).toBe(true);
  expect(r.frame).not.toThrow();
  expect(frames.size).toBe(0);
});

test("race: a key accepted before the cap whose feed ends after it is logged and counts", () => {
  const r = playing();
  nextReads = [T0 + CAP_MS - 1];
  t = T0 + CAP_MS + 50;
  r.press("x");
  expect(logOf(r)).toEqual(["x"]);
  expect(r.ctl.keys).toBe(1);
  expect(r.doc()).toBe("ne two three");
  r.frame();
  expect(r.ctl.phase).toBe("expired");
  expect(logOf(r)).toEqual(["x"]);
});

test("race: a solving key accepted just before the cap locks in at its acceptance time", () => {
  const r = playing();
  r.press("d");
  nextReads = [T0 + CAP_MS - 1];
  t = T0 + CAP_MS + 50;
  r.press("w");
  expect(r.ctl.phase).toBe("locked");
  expect(r.ctl.round.finishedAt).toBe(T0 + CAP_MS - 1);
  expect(r.ctl.prefs.best[puzzle.id]).toEqual({ keys: 2, ms: CAP_MS - 1 });
});

test("race: a key that expires the round is not logged and cannot reach the result card", () => {
  jest.useFakeTimers();
  const r = playing();
  const seenByWindow: boolean[] = [];
  const onWindowKey = () => seenByWindow.push(r.ctl.showResult);
  window.addEventListener("keydown", onWindowKey);
  try {
    t = T0 + CAP_MS + 10;
    r.press("Enter");
    expect(r.ctl.phase).toBe("expired");
    expect(logOf(r)).toEqual([]);
    expect(r.doc()).toBe("one two three");
    expect(seenByWindow).toEqual([false]);
    expect(r.ctl.showResult).toBe(false);
    jest.advanceTimersByTime(0);
    expect(r.ctl.showResult).toBe(true);
  } finally {
    window.removeEventListener("keydown", onWindowKey);
  }
});

test("lock-in: input stops, self-check ok, best recorded, card after the pulse", async () => {
  jest.useFakeTimers();
  const r = playing();
  t = T0 + 2_500;
  r.press("d");
  r.press("w");
  expect(r.ctl.phase).toBe("locked");
  expect(r.ctl.round.finishedAt).toBe(T0 + 2_500);
  expect(r.ctl.selfCheck).toBe("pending");
  await Promise.resolve();
  expect(r.ctl.selfCheck).toBe("ok");
  expect(r.ctl.newBest).toBe(true);
  expect(JSON.parse(r.storage.getItem("yank-wars:prefs:v1") ?? "null")).toEqual({
    relativeNumbers: true,
    name: "",
    best: { "round-flow": { keys: 2, ms: 2_500 } },
    player: "",
    daily: [],
    filter: { difficulty: null, unsolved: false },
  });
  r.press("x");
  expect(logOf(r)).toEqual(["d", "w"]);
  expect(r.doc()).toBe("two three");
  jest.advanceTimersByTime(LOCK_PULSE_MS - 1);
  expect(r.ctl.showResult).toBe(false);
  jest.advanceTimersByTime(1);
  expect(r.ctl.showResult).toBe(true);
});

test("a worse second round keeps the first best and reports it as the best before", () => {
  const storage = new MemoryStorage();
  const first = rig(storage);
  first.press(" ");
  first.press("d");
  first.press("w");
  t = T0 + 9_000;
  const second = rig(storage);
  expect(second.ctl.bestBefore).toEqual({ keys: 2, ms: 0 });
  second.press(" ");
  for (const k of ["Escape", "d", "w"]) second.press(k);
  expect(second.ctl.phase).toBe("locked");
  expect(second.ctl.newBest).toBe(false);
  expect(second.ctl.prefs.best[puzzle.id]).toEqual({ keys: 2, ms: 0 });
});

test("<C-S-L> flips line numbers, persists them, and is never logged", () => {
  const r = playing();
  r.press("L", { ctrlKey: true, shiftKey: true });
  expect(r.ctl.prefs.relativeNumbers).toBe(false);
  expect(JSON.parse(r.storage.getItem("yank-wars:prefs:v1") ?? "{}").relativeNumbers).toBe(false);
  r.press("L", { ctrlKey: true, shiftKey: true });
  expect(r.ctl.prefs.relativeNumbers).toBe(true);
  expect(logOf(r)).toEqual([]);
});

test("a dead key shows the hint, logs nothing, and the next real key clears it", () => {
  const r = playing();
  r.press("Dead");
  expect(r.ctl.blocked).toBe("dead");
  expect(r.ctl.keys).toBe(0);
  r.press("Process");
  expect(r.ctl.blocked).toBe("ime");
  r.press("a", { metaKey: true });
  expect(r.ctl.blocked).toBe("meta");
  r.press("F5");
  expect(r.ctl.blocked).toBe("fkey");
  expect(r.ctl.keys).toBe(0);
  r.press("l");
  expect(r.ctl.blocked).toBeNull();
  expect(logOf(r)).toEqual(["l"]);
});

test("an IME composition shows the hint even without a Process keydown", () => {
  const r = playing();
  r.press("i");
  const { CompositionEvent } = window as unknown as { CompositionEvent: typeof Event };
  r.host
    .querySelector(".cm-content")
    ?.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  expect(r.ctl.blocked).toBe("ime");
  expect(logOf(r)).toEqual(["i"]);
});

test("reset after the round is over is ignored", () => {
  const r = playing();
  r.press("d");
  r.press("w");
  r.ctl.reset();
  r.ctl.forfeit();
  expect(r.ctl.phase).toBe("locked");
  expect(r.ctl.round.runs).toBe(1);
});

test("the HUD snapshot follows the session, and a reset starts it fresh", () => {
  const r = playing();
  r.press("i");
  expect(r.ctl.snap.mode).toBe("insert");
  r.press("Enter", { ctrlKey: true });
  expect(r.ctl.snap.mode).toBe("normal");
  expect(r.ctl.linesOff).toBe(1);
});
