import { describe, expect, test } from "bun:test";
import {
  createRound,
  elapsedMs,
  RESET,
  type RoundState,
  reduceRound,
  remainingMs,
  scoreOf,
  type VimKey,
} from "../index.ts";

const k = (s: string) => s as VimKey;
const key = (s: string, solved = false) => ({ type: "key", key: k(s), solved }) as const;

function playingAt(t: number): RoundState {
  return reduceRound(createRound(1000), { type: "ready" }, t);
}

describe("study", () => {
  test("createRound starts a 5 s study window", () => {
    const r = createRound(1000);
    expect(r.phase).toBe("study");
    expect(r.createdAt).toBe(1000);
    expect(r.studyEndsAt).toBe(6000);
    expect(r.startedAt).toBeNull();
    expect(r.endsAt).toBeNull();
    expect(r.finishedAt).toBeNull();
    expect(r.log).toEqual([]);
    expect(r.runs).toBe(1);
  });

  test("a tick before the window ends changes nothing", () => {
    const r = createRound(1000);
    expect(reduceRound(r, { type: "tick" }, 5999)).toBe(r);
  });

  test("the tick that ends the window starts play with a 4 min cap", () => {
    const r = reduceRound(createRound(1000), { type: "tick" }, 6000);
    expect(r.phase).toBe("playing");
    expect(r.startedAt).toBe(6000);
    expect(r.endsAt).toBe(246000);
  });

  test("ready skips the rest of the window", () => {
    const r = reduceRound(createRound(1000), { type: "ready" }, 2000);
    expect(r.phase).toBe("playing");
    expect(r.startedAt).toBe(2000);
    expect(r.endsAt).toBe(242000);
  });

  test("keys, reset and forfeit are ignored during study", () => {
    const r = createRound(1000);
    expect(reduceRound(r, key("x"), 2000)).toBe(r);
    expect(reduceRound(r, key("x", true), 2000)).toBe(r);
    expect(reduceRound(r, { type: "reset" }, 2000)).toBe(r);
    expect(reduceRound(r, { type: "forfeit" }, 2000)).toBe(r);
  });

  test("cfg overrides the study and cap durations", () => {
    const r = createRound(0, { studyMs: 100, capMs: 1000 });
    expect(r.studyEndsAt).toBe(100);
    const p = reduceRound(r, { type: "tick" }, 100);
    expect(p.endsAt).toBe(1100);
  });
});

describe("playing", () => {
  test("a key appends to the log", () => {
    const r = reduceRound(reduceRound(playingAt(2000), key("x"), 3000), key("<Esc>"), 3100);
    expect(r.phase).toBe("playing");
    expect(r.log).toEqual<string[]>(["x", "<Esc>"]);
  });

  test("the solving key is logged and locks in", () => {
    const r = reduceRound(playingAt(2000), key("x", true), 7000);
    expect(r.phase).toBe("locked");
    expect(r.finishedAt).toBe(7000);
    expect(r.log).toEqual<string[]>(["x"]);
  });

  test("keys after lock-in are ignored", () => {
    const locked = reduceRound(playingAt(2000), key("x", true), 7000);
    expect(reduceRound(locked, key("y"), 8000)).toBe(locked);
    expect(reduceRound(locked, { type: "reset" }, 8000)).toBe(locked);
    expect(reduceRound(locked, { type: "tick" }, 999_999)).toBe(locked);
  });

  test("reset appends the marker and starts a new run at score 0", () => {
    const r = reduceRound(reduceRound(playingAt(2000), key("x"), 3000), { type: "reset" }, 4000);
    expect(r.log).toEqual<string[]>(["x", RESET]);
    expect(r.runs).toBe(2);
    expect(scoreOf(r.log)).toBe(0);
    expect(r.phase).toBe("playing");
  });

  test("the cap expires the round on the tick at endsAt", () => {
    const p = playingAt(2000);
    expect(reduceRound(p, { type: "tick" }, 241999)).toBe(p);
    const r = reduceRound(p, { type: "tick" }, 242000);
    expect(r.phase).toBe("expired");
    expect(r.finishedAt).toBe(242000);
  });

  test("a key arriving after the cap expires the round and is not logged", () => {
    const r = reduceRound(playingAt(2000), key("x", true), 250000);
    expect(r.phase).toBe("expired");
    expect(r.log).toEqual([]);
    expect(r.finishedAt).toBe(242000);
  });

  test("forfeit ends the round", () => {
    const r = reduceRound(playingAt(2000), { type: "forfeit" }, 9000);
    expect(r.phase).toBe("forfeited");
    expect(r.finishedAt).toBe(9000);
    expect(reduceRound(r, key("x"), 9500)).toBe(r);
  });

  test("ready while playing changes nothing", () => {
    const p = playingAt(2000);
    expect(reduceRound(p, { type: "ready" }, 3000)).toBe(p);
  });
});

describe("clocks", () => {
  test("elapsedMs is 0 in study, runs while playing, freezes after lock-in", () => {
    expect(elapsedMs(createRound(1000), 4000)).toBe(0);
    const p = playingAt(2000);
    expect(elapsedMs(p, 5500)).toBe(3500);
    const locked = reduceRound(p, key("x", true), 7000);
    expect(elapsedMs(locked, 60000)).toBe(5000);
  });

  test("elapsedMs freezes at the cap when the round expires", () => {
    const r = reduceRound(playingAt(2000), { type: "tick" }, 243000);
    expect(elapsedMs(r, 300000)).toBe(240000);
  });

  test("remainingMs counts down while playing and clamps at 0", () => {
    const p = playingAt(2000);
    expect(remainingMs(p, 2000)).toBe(240000);
    expect(remainingMs(p, 142000)).toBe(100000);
    expect(remainingMs(p, 300000)).toBe(0);
    expect(remainingMs(createRound(1000), 2000)).toBe(0);
    expect(remainingMs(reduceRound(p, { type: "forfeit" }, 3000), 3000)).toBe(0);
  });
});
