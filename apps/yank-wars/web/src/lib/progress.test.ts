import { expect, test } from "bun:test";
import { playablePuzzle } from "@yank-wars/engine/oracle/engine";
import { markOf, progressOf } from "./progress.ts";

test("marks compare a best with par", () => {
  expect(markOf({ keys: 3, ms: 1 }, 4)).toBe("under");
  expect(markOf({ keys: 4, ms: 1 }, 4)).toBe("par");
  expect(markOf({ keys: 5, ms: 1 }, 4)).toBe("over");
});

test("progress counts solved puzzles and those at par or better, ignoring bests for unknown ids", () => {
  const list = ["a", "b", "c", "d"].map((id) =>
    playablePuzzle("a", "b", "rbx<Esc>", { id: `p-${id}` }),
  );
  expect(list.map((p) => p.par)).toEqual([4, 4, 4, 4]);
  const best = {
    "p-a": { keys: 3, ms: 1 },
    "p-b": { keys: 4, ms: 1 },
    "p-c": { keys: 9, ms: 1 },
    gone: { keys: 1, ms: 1 },
  };
  expect(progressOf(list, best)).toEqual({ solved: 3, parOrBetter: 2 });
  expect(progressOf(list, {})).toEqual({ solved: 0, parOrBetter: 0 });
});
