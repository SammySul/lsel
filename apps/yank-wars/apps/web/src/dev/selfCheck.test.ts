import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { type LogEntry, parseKeys, parsePuzzle, RESET } from "@yank-wars/engine";
import { runSelfCheck } from "./selfCheck.ts";

const puzzle = parsePuzzle({
  id: "quote-style",
  title: "Double quotes",
  difficulty: "easy",
  language: "javascript",
  tabSize: 2,
  indentUnit: "  ",
  start: "const names = ['ada', 'linus', 'grace'];\nexport default names;",
  target: 'const names = ["ada", "linus", "grace"];\nexport default names;',
  solution: ":s/'/\"/g<CR>",
  source: { kind: "original", author: "yank-wars" },
});

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

test("a solving run whose replay matches the live buffer is ok", () => {
  expect(runSelfCheck(puzzle, puzzle.solution, puzzle.target)).toBe("ok");
  expect(warn).not.toHaveBeenCalled();
});

test("only the run after the last reset is replayed", () => {
  // Replayed whole, dd would leave :s nothing to change on the first line.
  const log: LogEntry[] = [...parseKeys("dd"), RESET, ...puzzle.solution];
  expect(runSelfCheck(puzzle, log, puzzle.target)).toBe("ok");
});

test("a live buffer that differs from the replay is a mismatch and is reported", () => {
  const live = 'const names = ["ada", "linus", "grace"];\nexport default name;';
  expect(runSelfCheck(puzzle, puzzle.solution, live)).toBe("mismatch");
  expect(warn).toHaveBeenCalledTimes(1);
  const report = warn.mock.calls[0]?.[1] as { notation: string; firstDifference: unknown };
  expect(report.notation).toBe(":s/'/\"/g<CR>");
  expect(report.firstDifference).toEqual({
    line: 2,
    live: "export default name;",
    replay: "export default names;",
  });
});

test("the replay runs in a fixed offscreen host that is gone afterwards", () => {
  const before = document.body.childElementCount;
  const seen = new MutationObserver(() => {});
  seen.observe(document.body, { childList: true });
  try {
    expect(runSelfCheck(puzzle, puzzle.solution, puzzle.target)).toBe("ok");
    const records = seen.takeRecords();
    const added = records.flatMap((r) => [...r.addedNodes]) as HTMLElement[];
    expect(added.length).toBe(1);
    expect(added[0]?.style.position).toBe("fixed");
    expect(added[0]?.style.left).toBe("-9999px");
    expect(records.flatMap((r) => [...r.removedNodes])).toEqual(added);
    expect(document.body.childElementCount).toBe(before);
  } finally {
    seen.disconnect();
  }
});

test("a run whose last key is not the solving key is a mismatch", () => {
  const log = [...puzzle.solution, ...parseKeys("0")];
  expect(runSelfCheck(puzzle, log, puzzle.target)).toBe("mismatch");
});
