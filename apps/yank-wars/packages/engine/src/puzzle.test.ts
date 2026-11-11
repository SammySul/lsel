import { describe, expect, test } from "bun:test";
import { PuzzleError, type PuzzleJson, parsePuzzle } from "./index.ts";

const example: PuzzleJson = {
  id: "quote-style",
  title: "Double quotes",
  description: "The linter wants double quotes.",
  language: "javascript",
  tabSize: 2,
  indentUnit: "  ",
  start:
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the puzzle text is JavaScript source
    "const names = ['ada', 'linus', 'grace'];\nconst greet = (n) => `hi ${n}`;\nexport default names.map(greet);",
  target:
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the puzzle text is JavaScript source
    'const names = ["ada", "linus", "grace"];\nconst greet = (n) => `hi ${n}`;\nexport default names.map(greet);',
  solution: ":s/'/\"/g<CR>",
  source: { kind: "original", author: "yank-wars" },
  tags: ["substitute"],
};

function issuesOf(json: unknown, expectedId?: string): readonly string[] {
  try {
    parsePuzzle(json, expectedId);
  } catch (e) {
    if (e instanceof PuzzleError) return e.issues;
    throw e;
  }
  throw new Error("parsePuzzle accepted it");
}

const lines = (n: number, width: number) => Array.from({ length: n }, () => "x".repeat(width));

describe("parsePuzzle accepts", () => {
  test("the spec example, with par counted from the solution", () => {
    const p = parsePuzzle(example, "quote-style");
    expect(p.solution).toEqual<string[]>([":", "s", "/", "'", "/", '"', "/", "g", "<CR>"]);
    expect(p.par).toBe(9);
    expect(p.id).toBe("quote-style");
    expect(p.tabSize).toBe(2);
    expect(p.indentUnit).toBe("  ");
    expect(p.description).toBe("The linter wants double quotes.");
    expect(p.tags).toEqual(["substitute"]);
    expect(p.source).toEqual({ kind: "original", author: "yank-wars" });
  });

  test("optional fields may be absent and stay absent", () => {
    const { description: _d, tags: _t, ...bare } = example;
    const p = parsePuzzle(bare);
    expect("description" in p).toBe(false);
    expect("tags" in p).toBe(false);
  });

  test("the limits themselves: 30 lines, 120-char lines, 3000 chars", () => {
    expect(parsePuzzle({ ...example, start: lines(30, 10).join("\n") }).id).toBe("quote-style");
    expect(parsePuzzle({ ...example, start: "x".repeat(120) }).id).toBe("quote-style");
    const big = [...lines(24, 120), "x".repeat(3000 - 24 * 121)].join("\n");
    expect(big.length).toBe(3000);
    expect(parsePuzzle({ ...example, start: big }).id).toBe("quote-style");
  });

  test("tabs when indentUnit is a tab", () => {
    const p = parsePuzzle({
      ...example,
      indentUnit: "\t",
      tabSize: 4,
      start: "func f() {\nx()\n}",
      target: "func f() {\n\tx()\n}",
      solution: "j>>",
    });
    expect(p.par).toBe(3);
  });

  test("an excerpt with a permalink", () => {
    const commit = "0123456789abcdef0123456789abcdef01234567";
    const source = {
      kind: "excerpt",
      repo: "example/repo",
      url: `https://github.com/example/repo/blob/${commit}/src/a.js#L1-L3`,
      license: "MIT",
      path: "src/a.js",
      commit,
    } as const;
    expect(parsePuzzle({ ...example, source }).source).toEqual(source);
  });

  test("a space in the solution is <Space>", () => {
    expect(parsePuzzle({ ...example, solution: "f i<Esc>" }).solution).toEqual<string[]>([
      "f",
      "<Space>",
      "i",
      "<Esc>",
    ]);
  });
});

describe("parsePuzzle rejects, naming the field", () => {
  test("a trailing newline in start", () => {
    expect(issuesOf({ ...example, start: `${example.start}\n` })).toEqual([
      "start: must not end with a newline (the editor has no final line terminator)",
    ]);
  });

  test("CRLF line endings", () => {
    expect(issuesOf({ ...example, target: example.target.replaceAll("\n", "\r\n") })).toEqual([
      "target: must use LF line endings (found \\r)",
    ]);
  });

  test("31 lines", () => {
    expect(issuesOf({ ...example, start: lines(31, 3).join("\n") })).toEqual([
      "start: has 31 lines (max 30)",
    ]);
  });

  test("a 121-char line", () => {
    expect(issuesOf({ ...example, start: `ab\n${"x".repeat(121)}` })).toEqual([
      "start: line 2 is 121 chars (max 120; nothing wraps)",
    ]);
  });

  test("3001 chars", () => {
    const big = [...lines(24, 120), "x".repeat(3001 - 24 * 121)].join("\n");
    expect(big.length).toBe(3001);
    expect(issuesOf({ ...example, target: big })).toEqual(["target: is 3001 chars (max 3000)"]);
  });

  test("a non-ASCII character", () => {
    expect(issuesOf({ ...example, target: "const s = 'über';" })).toEqual([
      'target: has "ü" at offset 11: only printable ASCII, tab and newline are allowed',
    ]);
  });

  test("a tab when indentUnit is spaces", () => {
    expect(issuesOf({ ...example, start: "if x {\n\ty()\n}" })).toEqual([
      'start: has a tab, which needs indentUnit "\\t"',
    ]);
  });

  test("start === target", () => {
    expect(issuesOf({ ...example, target: example.start })).toEqual([
      "target: must differ from start",
    ]);
  });

  test("an empty target", () => {
    expect(issuesOf({ ...example, target: "" })).toEqual(["target: must not be empty"]);
  });

  test("an id that is not kebab-case", () => {
    expect(issuesOf({ ...example, id: "Quote_Style" })).toEqual([
      "id: must be lower-case kebab-case",
    ]);
  });

  test("an id that does not match the file name", () => {
    expect(issuesOf(example, "double-quotes")).toEqual([
      'id: "quote-style" does not match the file name "double-quotes"',
    ]);
  });

  test("an unknown language", () => {
    const issues = issuesOf({ ...example, language: "cobol" });
    expect(issues.length).toBe(1);
    expect(issues[0]).toStartWith("language: ");
    expect(issues[0]).toContain('"cobol"');
  });

  test("a solution with a bare <", () => {
    expect(issuesOf({ ...example, solution: "a<b" })).toEqual([
      'solution: bare "<" at 1: write <lt>',
    ]);
  });

  test("an excerpt without a commit", () => {
    const issues = issuesOf({
      ...example,
      source: {
        kind: "excerpt",
        repo: "example/repo",
        url: "https://github.com/example/repo/blob/main/a.js",
        license: "MIT",
        path: "a.js",
      },
    });
    expect(issues.length).toBe(1);
    expect(issues[0]).toStartWith("source.commit: ");
  });

  test("an excerpt url that is not a permalink to the commit", () => {
    expect(
      issuesOf({
        ...example,
        source: {
          kind: "excerpt",
          repo: "example/repo",
          url: "https://github.com/example/repo/blob/main/a.js",
          license: "MIT",
          path: "a.js",
          commit: "0123456789abcdef0123456789abcdef01234567",
        },
      }),
    ).toEqual(["source.url: must be a permalink containing the commit"]);
  });

  test("a stored par (unknown keys are typos or derived data)", () => {
    const issues = issuesOf({ ...example, par: 10 });
    expect(issues.length).toBe(1);
    expect(issues[0]).toStartWith("par: ");
  });

  test("a tabSize outside 2, 4, 8", () => {
    const issues = issuesOf({ ...example, tabSize: 3 });
    expect(issues.length).toBe(1);
    expect(issues[0]).toStartWith("tabSize: ");
  });

  test("every issue at once, one per line in the message", () => {
    const err = (() => {
      try {
        parsePuzzle({ ...example, id: "X", start: `${example.start}\n`, solution: "<Foo>" });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(PuzzleError);
    const issues = (err as PuzzleError).issues;
    expect(issues.map((i) => i.split(":")[0])).toEqual(["id", "id", "start", "solution"]);
    expect((err as PuzzleError).message).toBe(issues.join("\n"));
  });

  test("non-objects", () => {
    expect(issuesOf(null).length).toBe(1);
    expect(issuesOf("quote-style")[0]).toStartWith("(root): ");
  });
});
