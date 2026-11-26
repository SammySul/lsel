import { describe, expect, test } from "bun:test";
import { type ClientFrame, parseClientFrame, parseKeys, RESET } from "../index.ts";

const parse = (frame: unknown) => parseClientFrame(JSON.stringify(frame));

describe("client frames", () => {
  test("a hello creating a room, and one taking a seat back, trimmed", () => {
    expect(parse({ v: 2, t: "hello", name: "  ada " })).toEqual({
      ok: true,
      frame: { v: 2, t: "hello", name: "ada" },
    });
    const back: ClientFrame = {
      v: 2,
      t: "hello",
      room: "abcdefgh23",
      seat: "0".repeat(32),
      name: "ada",
    };
    expect(parse(back)).toEqual({ ok: true, frame: back });
  });

  test("keys with reset markers", () => {
    const f: ClientFrame = {
      v: 2,
      t: "keys",
      round: 2,
      from: 3,
      entries: [...parseKeys("d"), RESET, ...parseKeys("<C-v><lt>")],
    };
    expect(parse(f)).toEqual({ ok: true, frame: f });
  });

  test("an entry that is not a key, a bad room id, an unknown field", () => {
    expect(parse({ v: 2, t: "keys", round: 1, from: 0, entries: ["dd"] })).toEqual({
      ok: false,
      stale: false,
      error: "entries.0: not a key or reset marker",
    });
    expect(parse({ v: 2, t: "hello", room: "ABC", name: "x" })).toEqual({
      ok: false,
      stale: false,
      error: "room: not a room id",
    });
    expect(parse({ v: 2, t: "ready", extra: 1 }).ok).toBe(false);
  });

  test("another protocol version is stale; garbage and huge frames are not frames", () => {
    expect(parse({ v: 1, t: "hello", name: "x" })).toEqual({
      ok: false,
      stale: true,
      error: "protocol 1, expected 2",
    });
    expect(parseClientFrame("{")).toEqual({ ok: false, stale: false, error: "not JSON" });
    expect(parseClientFrame(" ".repeat(16_385))).toEqual({
      ok: false,
      stale: false,
      error: "frame too large",
    });
  });
});
