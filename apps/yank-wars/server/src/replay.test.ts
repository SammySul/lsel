import { afterAll, expect, test } from "bun:test";
import { parseKeys, parsePuzzle, RESET } from "@yank-wars/engine";
import { Replayer } from "./replay.ts";

const puzzle = parsePuzzle({
  id: "replay-probe",
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

const replayer = new Replayer(500);
afterAll(() => replayer.close());

test("a run that reaches the target on its last key is accepted with its score", async () => {
  expect(await replayer.verify(puzzle, [...parseKeys("dd"), RESET, ...parseKeys("wDx")])).toEqual({
    ok: true,
    score: 3,
  });
});

test("a run that does not reach the target is a mismatch with the replay's buffer", async () => {
  expect(await replayer.verify(puzzle, parseKeys("wD"))).toEqual({
    ok: false,
    reason: "mismatch",
    doc: "one \nthree",
    errors: [],
  });
});

test("a runaway replay is refused as too slow, and the next claim still verifies", async () => {
  // 99999 line copies: nothing fails, so only the timeout ends it.
  const runaway = parseKeys("qqyypq99999@q");
  const slow = replayer.verify(puzzle, runaway);
  const next = replayer.verify(puzzle, parseKeys("wDx"));
  expect(await slow).toEqual({ ok: false, reason: "too slow" });
  expect(await next).toEqual({ ok: true, score: 3 });
});
