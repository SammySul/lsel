# Puzzles

Each puzzle is one JSON file, `handmade/<id>.json`. Puzzles are data: no code
lives here. The engine loads them through `parsePuzzle`
(`packages/engine/src/puzzle.ts`), which enforces every rule below that is not
marked *test*. The web app loads them with `import.meta.glob`; the engine tests
load them with `Bun.Glob`.

## Schema

```ts
{
  id: string;            // ^[a-z0-9]+(-[a-z0-9]+)*$, 3..40 chars, equal to the file name
  title: string;         // 1..60 chars
  difficulty: "easy" | "medium" | "hard";
  description?: string;  // at most 200 chars
  language: "text" | "javascript" | "typescript" | "jsx" | "tsx" | "python" | "go" | "rust" | "json" | "css";
  tabSize: 2 | 4 | 8;
  indentUnit: "  " | "    " | "\t";
  start: string;
  target: string;
  solution: string;      // vim key notation; par = its key count, never stored
  source: { kind: "original"; author: string }
        | { kind: "excerpt"; repo: string; url: string; license: "MIT" | "Apache-2.0" | "BSD-2-Clause" | "BSD-3-Clause" | "ISC"; path: string; commit: string };
  tags?: string[];
}
```

Unknown keys are rejected, so a stored `par` or a misspelt field fails loudly.

## Rules

1. **`start` and `target`**: LF line endings only, and **no trailing newline**.
   The editor has no final line terminator, and lock-in is
   `doc === target`, so a trailing `\n` would be an extra empty line the player
   has to create. Each must be 1..30 lines, at most 120 chars per line (nothing
   wraps) and at most 3000 chars (the whole document fits the language's first
   synchronous parse). Only printable ASCII, tab and newline are allowed, so
   every puzzle can be typed on every keyboard layout. `target` must be
   non-empty and differ from `start`.
2. **Tabs** may appear only when `indentUnit` is `"\t"`. `indentUnit` and
   `tabSize` are engine config, since `>>`, `<<` and `=` read them.
3. **`solution`** must parse with `parseKeys`. A literal `<` is `<lt>`. A space
   may be written as `" "` or `<Space>`; write `<Space>` when it is the last key,
   so it stays visible.
   *test*: replaying the solution reaches `target` **on its last key**, and the
   empty replay does not. Lock-in is automatic the moment the buffer matches,
   even in insert mode, so a solution that finishes while typing must not end
   with `<Esc>`. The test rejects trailing keys like that, which keeps par
   honest.
4. **`source`** is required. An `excerpt` needs the repo, a permalink `url`
   that contains the full 40-char `commit`, an allowed `license` and the `path`.
   Prefer original snippets. Use VimGolf challenges only with the maintainer's
   permission.
5. **`difficulty`** orders the list (easy first, then par, then title), so it
   is how hard the puzzle feels, not its par. *easy*: one vim idea, par at most
   10 (*test*); *medium*: two ideas or an ex command; *hard*: macros, regex
   or a plan. Most puzzles are easy: they are the most fun.
6. *test*: ids are unique and equal their file names. Par is between 3 and 60,
   and it is listed in `PAR` in `packages/engine/src/puzzles.test.ts`, so every
   change to a solution is deliberate.

## Engine semantics authors must know

These all differ from a stock vim, and they apply the same way in the browser
and in replay.

- `o`, `O` and insert-mode `<CR>` insert a plain newline with no autoindent, and
  `cc`/`S` delete the indent with the text (vim's `noautoindent`). `=`, `>>` and
  `<<` still follow the puzzle's language and `indentUnit`.
- `/` **and `:s`** use vim regex syntax (`\(` `\)` `\+` `\<` `\>` `\{n\}`), and
  both always use ignorecase+smartcase: `:s/data/x/` also matches `Data`.
- `:map`, `:set`, `:w` and `:colorscheme` are blocked. `:e`, `:r` and `:!`
  don't exist.
- `"+` and `"*` act as the unnamed register.
- `H`, `M`, `L`, `<C-d>`, `<C-u>`, `<C-f>` and `<C-b>` work on a virtual
  30-line window anchored at line 1. `zz`, `zt` and `zb` do nothing.
- In replace mode (`R`), `<BS>` moves left without restoring the replaced
  character, and a later `.` or `@q` repeats only what was typed after the last
  `<BS>`. `R` without `<BS>` repeats like vim.
- Everything else known to differ from vim (block pastes, sentence objects,
  marks, numbered registers, ...) is listed by group in `docs/decisions.md`
  ("Engine deviations from vim"); a solution must not rely on vim there.

## Proving a puzzle

From the repo root:

```sh
bun test packages/engine/src/puzzles.test.ts
```

Write the solution, run the test, then set the puzzle's entry in `PAR` to the
proven length.
