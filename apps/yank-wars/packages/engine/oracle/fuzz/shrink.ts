import { formatKeys, parseKeys } from "../../src/keys.ts";
import type { Divergence, Probe } from "./check.ts";
import { ddmin } from "./minimize.ts";
import { safeCandidate } from "./safe.ts";

export interface Shrunk {
  probe: Probe;
  divergence: Divergence;
}

export type Check = (p: Probe) => Promise<Divergence | undefined>;

/** Shrinks commands, keys, start lines, start chars, keys; a candidate must diverge the same way (Kind, crash) so bugs don't swap. */
export async function shrink(
  check: Check,
  start: string,
  chunks: readonly string[],
  settings: Probe["settings"],
  original: Divergence,
): Promise<Shrunk> {
  const original0 = chunks.join("");
  let best: Shrunk = { probe: { start, keys: original0, settings }, divergence: original };
  const test = async (p: Probe): Promise<boolean> => {
    // like the grammar: vim opens on line 1's first non-blank, the engine at 1:1
    if (p.keys === "" || p.start.endsWith("\n") || /^[ \t]/.test(p.start)) return false;
    if (!safeCandidate(p.keys, original0)) return false;
    const d = await check(p);
    if (d === undefined || d.kind !== original.kind || d.crash !== original.crash) return false;
    best = { probe: p, divergence: d };
    return true;
  };
  const withKeys = (keys: string): Probe => ({ ...best.probe, keys });
  const withStart = (s: string): Probe => ({ ...best.probe, start: s });
  const byKeys = () => ddmin(parseKeys(best.probe.keys), (ks) => test(withKeys(formatKeys(ks))));

  await ddmin(chunks, (cs) => test(withKeys(cs.join(""))));
  await byKeys();
  await ddmin(best.probe.start.split("\n"), (ls) => test(withStart(ls.join("\n"))));
  await ddmin([...best.probe.start], (cs) => test(withStart(cs.join(""))));
  await byKeys();
  // ddmin keeps exactly its last passing candidate, so best is the result
  return best;
}
