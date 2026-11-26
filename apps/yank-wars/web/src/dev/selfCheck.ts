// DEV only: replays a finished round headless and warns when it differs from the live editor.

import { currentRun, formatKeys, type KeyLog, type Puzzle, verifyRun } from "@yank-wars/engine";

function firstDifferingLine(live: string, replayed: string) {
  const a = live.split("\n");
  const b = replayed.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { line: i + 1, live: a[i] ?? null, replay: b[i] ?? null };
  }
  return null;
}

export function runSelfCheck(puzzle: Puzzle, log: KeyLog, liveDoc: string): "ok" | "mismatch" {
  const notation = formatKeys(currentRun(log));
  const host = document.createElement("div");
  // Fixed, not absolute: CM6's scrollIntoView stops at fixed ancestors, so the replay never scrolls the page.
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:600px;height:400px";
  document.body.append(host);
  try {
    const { ok, result } = verifyRun(puzzle, log, { parent: host });
    if (ok && result.doc === liveDoc) return "ok";
    console.warn("[yank-wars] self-check mismatch", {
      puzzle: puzzle.id,
      notation,
      verified: ok,
      solvedAt: result.solvedAt,
      errors: result.errors,
      liveDoc,
      replayDoc: result.doc,
      firstDifference: firstDifferingLine(liveDoc, result.doc),
    });
  } catch (e) {
    console.warn("[yank-wars] self-check replay threw", { puzzle: puzzle.id, notation, error: e });
  } finally {
    host.remove();
  }
  return "mismatch";
}
