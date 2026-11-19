# @yank-wars/web

The solo client: puzzle list, round flow, split view with live diff. Run everything from the
repo root (`bunfig.toml` is read from the cwd only):

```sh
bun run dev     # vite dev server; DEV build, so the result card shows the self-check badge
bun run build   # production build into apps/web/dist
bun run check   # tsc (engine, server), svelte-check (web), biome, lsel-check
```

## Browser tests

Playwright drives the DEV server in Chromium, Firefox and WebKit. They need the dev shell's
browsers and are not part of plain `bun test` (the files end in `.e2e.ts`):

```sh
nix develop -c bun run test:browser                    # every oracle case typed into the player view
nix develop -c bun test ./apps/web/e2e/flow.e2e.ts     # the real app, list to result card
nix develop -c bun test ./apps/web/e2e/parity.e2e.ts   # oracle cases: live == replay of the log == vim
nix develop -c bun test ./apps/web/e2e/built.e2e.ts    # the production build behind the server's CSP
```

CI runs them all (`bun run test:e2e` is the three `e2e/` files; `built.e2e.ts` needs `bun run build`). `test:browser` (`browser/run.ts`) expects vim's answer, or the pinned engine output for a case in
`oracle/deviations.json`, and checks the logged keys, focus and that no unlogged change got in;
`browser/known.ts` lists browser-only failures per platform (empty).

- `flow.e2e.ts`: study, ready keys, counter, reset, give up, the 4-minute cap and the key that
  crosses it (fake clock), all ten puzzles locking in with the self-check `ok`, result card keys
  (`r`, Esc, Enter, `s`, and `c` copying the run, checked on the clipboard in Chromium), bests and
  line numbers across reload and a second tab, the puzzle list by `j`/`k` and arrows, the command
  line in the status line (`<Esc>`, `<Up>`, a bad regex, `:w`, `:set`), mouse, target pane,
  clipboard and drag events, focus hint, Shift/AltGr/Meta/F-keys, a dead key, an IME composition
  (Chromium), and live-versus-replay checks on a first mount and after a reset.
- `parity.e2e.ts`: per case, the live buffer, cursor and mode must equal a headless replay of the
  logged keys and vim's answer, and the log must equal the typed keys. A second pass jumps the
  page clock between keys. Env: `BROWSERS`, `ORACLE_CATEGORY`, `ORACLE_CASE`, `YW_SAMPLE`
  (default 40, or `all`), `YW_SEED`, `YW_CLOCK_SAMPLE`.
- `src/lib/round.test.ts` (plain `bun test`) runs `RoundController` headless with an injected
  clock; the `@sammysul/lsel/testing/preload` in `bunfig.toml` compiles `*.svelte.ts` for it.

## Still manual

Playwright sends synthetic events through each browser's protocol, so these still need a person:

- On a German layout, `{` (AltGr+7 on Windows, Option+8 on macOS) types `{`.
- A dead key on a real US-International layout and a real IME show the hint and insert nothing.
- Holding a key repeats it, and every repeat counts as one key.
- Windows/Linux Chrome: the insert-mode status line shows the Ctrl+W hint.
- The result card's `c` in a stock Firefox and Safari (headless Firefox and WebKit may refuse
  clipboard writes, so the suite only checks the button reports one outcome there).
- A stock Firefox and Safari behave like Playwright's builds (the suites run patched ones).
- HMR: editing a component under `bun run dev` updates the page without a full reload.
