import { describe, expect, test } from "bun:test";
import { generateCases } from "./grammar.ts";
import { exLineOk, safeCandidate } from "./safe.ts";

describe("exLineOk", () => {
  test("accepts the commands the grammar writes", () => {
    for (const l of ["%s/a/b/g", "2,4s/x//", ".,+1s/,\\n/ /", "g/foo/d", "g/a\\/b/d", "g/^/m0"]) {
      expect({ l, ok: exLineOk(l) }).toEqual({ l, ok: true });
    }
    for (const l of ["%norm @q", "t.", "m$", "j", "sort", "<lt>", ">", "&&", "3", ".,$d"]) {
      expect({ l, ok: exLineOk(l) }).toEqual({ l, ok: true });
    }
  });

  test("rejects commands that reach files, buffers or programs", () => {
    // :n is :next, :gr is :grep, :e edits a file, :g/x alone prints, :r reads a file
    for (const l of ["n/", "n w", "gr", "e foo", "g/r", "r !ls", "w", "q", "sh", "!ls", "b2"]) {
      expect({ l, ok: exLineOk(l) }).toEqual({ l, ok: false });
    }
  });
});

describe("safeCandidate", () => {
  test("rejects new other-buffer keys but keeps ones the original had", () => {
    expect(safeCandidate("q:", "qqxq:s/a/b/<CR>")).toBe(true);
    expect(safeCandidate("q:", "qqxq")).toBe(false);
    expect(safeCandidate("=G", "x")).toBe(false);
  });

  test("allows a shrunk ex line only if the grammar could write it or the original had it", () => {
    expect(safeCandidate(":s/g<CR>", ":s/g/x/<CR>")).toBe(true);
    expect(safeCandidate(":n/<CR>", ":norm A/<CR>")).toBe(false);
    expect(safeCandidate(":b/c/<CR>", ":s/a:b/c/<CR>")).toBe(true);
  });

  test("every ex command the grammar writes passes exLineOk", () => {
    const lines = generateCases(1, 3200)
      .flatMap((c) => c.chunks)
      .map((ch) => /^:(.*)<CR>$/.exec(ch)?.[1])
      .filter((l) => l !== undefined);
    expect(lines.length).toBeGreaterThan(1000);
    expect(lines.filter((l) => !exLineOk(l))).toEqual([]);
  });
});
