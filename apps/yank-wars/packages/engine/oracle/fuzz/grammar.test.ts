import { describe, expect, test } from "bun:test";
import { parseKeys } from "../../src/keys.ts";
import { caseProblems } from "../types.ts";
import { FUZZ_COUNT, FUZZ_SEED, fuzzCases } from "./corpus.ts";
import { generateCase, generateCases } from "./grammar.ts";
import { Rng } from "./prng.ts";

const cases = generateCases(FUZZ_SEED, FUZZ_COUNT);

describe("Rng", () => {
  test("the same seed and stream repeat; another stream differs", () => {
    const draw = (seed: number, stream: number) => {
      const r = new Rng(seed, stream);
      return Array.from({ length: 8 }, () => r.next());
    };
    expect(draw(1, 5)).toEqual(draw(1, 5));
    expect(draw(1, 5)).not.toEqual(draw(1, 6));
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
  });

  test("int stays in its bounds and reaches both ends", () => {
    const r = new Rng(3, 0);
    const seen = new Set(Array.from({ length: 2000 }, () => r.int(2, 5)));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
});

describe("generator", () => {
  test("a case depends only on its seed and index", () => {
    expect(generateCase(FUZZ_SEED, 1234)).toEqual(cases[1234] as ReturnType<typeof generateCase>);
    expect(generateCases(FUZZ_SEED, 5, 1234)[0]).toEqual(generateCase(FUZZ_SEED, 1234));
  });

  test("the committed corpus is valid and has at least 3000 cases", () => {
    expect(fuzzCases().length).toBeGreaterThanOrEqual(3000);
    expect(cases.filter((c) => caseProblems(c).length > 0).map((c) => c.id)).toEqual([]);
  });

  test("keys are the chunks joined, and every chunk parses on its own", () => {
    for (const c of cases) {
      expect(c.chunks.join("")).toBe(c.keys);
      for (const ch of c.chunks) expect(parseKeys(ch).length).toBeGreaterThan(0);
    }
  });

  test("start texts are at most 30 lines", () => {
    expect(cases.filter((c) => c.start.split("\n").length > 30).map((c) => c.id)).toEqual([]);
  });

  test("no case asks vim for something the oracle cannot answer or that ends the session", () => {
    // completion depends on typeahead timing; ZZ/ZQ quit; K runs a program; Q enters Ex mode
    const bad = /<C-[np]>|Z[ZQ]|Q|\bK/;
    expect(cases.filter((c) => bad.test(c.keys)).map((c) => c.keys)).toEqual([]);
  });

  test("every area of golf the grammar targets shows up often", () => {
    const share = (re: RegExp) => cases.filter((c) => re.test(c.keys)).length;
    const counts = {
      countedMotion: share(/(^|[^0-9"@])[2-9][hjklwbeWBE]/),
      textObject: share(/[dcyv][ia][wWp("'[{]/),
      insertKey: share(/<(BS|C-w|C-u|CR|Tab|Del|C-o|C-r)>.*<Esc>/),
      visualBlock: share(/<C-v>/),
      substitute: share(/:[%.0-9,+$]*s\//),
      global: share(/:[gv]\//),
      normal: share(/norm /),
      macroRecord: share(/q[qwe].*q/),
      macroPlay: share(/@[qwe@]/),
      dot: share(/\./),
      undo: share(/u|<C-r>/),
      register: share(/"[abcAB_]/),
      mark: share(/m[ab]/),
    };
    for (const [area, n] of Object.entries(counts)) {
      expect({ area, enough: n >= 100 }).toEqual({ area, enough: true });
    }
  });
});
