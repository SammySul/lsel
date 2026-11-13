import { describe, expect, test } from "bun:test";
import type { Observed } from "../types.ts";
import { DEFAULT_SETTINGS } from "../types.ts";
import type { Divergence, Kind, Probe } from "./check.ts";
import { shrink } from "./shrink.ts";

const nowhere: Observed = { doc: "", cursor: { line: 1, col: 1 }, mode: "normal" };

function div(kind: Kind, crash = false): Divergence {
  return { kind, crash, vim: nowhere, engine: { ...nowhere, errors: [] } };
}

describe("shrink", () => {
  test("drops commands, keys, lines and characters the failure does not need", async () => {
    // a stand-in bug: <C-o> followed by x misbehaves whenever the buffer holds a "c"
    const check = async (p: Probe) =>
      p.keys.includes("<C-o>x") && p.start.includes("c") ? div("doc") : undefined;
    const out = await shrink(
      check,
      "first line\nabc\nlast",
      ["j", "dd", "A<C-o>xZ<Esc>", "u", "0"],
      DEFAULT_SETTINGS,
      div("doc"),
    );
    expect(out.probe).toEqual({ start: "c", keys: "<C-o>x", settings: DEFAULT_SETTINGS });
  });

  test("does not slip from one kind of divergence into another", async () => {
    // with "x" alone the stand-in engine only gets the cursor wrong; the doc needs "x" and "p"
    const check = async (p: Probe) => {
      if (p.keys.includes("x") && p.keys.includes("p")) return div("doc");
      if (p.keys.includes("x")) return div("cursor");
      return undefined;
    };
    const out = await shrink(check, "ab", ["x", "w", "p"], DEFAULT_SETTINGS, div("doc"));
    expect(out.probe.keys).toBe("xp");
  });

  test("keeps a crash a crash", async () => {
    const check = async (p: Probe) => {
      if (p.keys.includes(":s")) return div("doc", p.keys.includes("\\'"));
      return undefined;
    };
    const out = await shrink(
      check,
      "a'b",
      ["0", String.raw`:s/\'/"/<CR>`],
      DEFAULT_SETTINGS,
      div("doc", true),
    );
    expect(out.probe.keys).toBe(String.raw`:s\'`);
    expect(out.divergence.crash).toBe(true);
  });

  test("never proposes an indented first line, a start ending in a newline or empty keys", async () => {
    const seen: Probe[] = [];
    const check = async (p: Probe) => {
      seen.push(p);
      return div("doc");
    };
    await shrink(check, "a b\nb\n\nc", ["x", "y"], DEFAULT_SETTINGS, div("doc"));
    expect(seen.length).toBeGreaterThan(0);
    const bad = seen.filter(
      (p) => p.keys === "" || p.start.endsWith("\n") || /^[ \t]/.test(p.start),
    );
    expect(bad).toEqual([]);
  });
});
