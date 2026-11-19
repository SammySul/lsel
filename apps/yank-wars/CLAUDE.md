# yank-wars

Head-to-head vim golf in the browser. Everyone gets the same code and a target;
the first to match the target locks in and starts a grace timer for the rest;
fewest keystrokes among finishers wins, ties go to whoever finished first.
Rationale for every stack choice is in `docs/decisions.md`.

```
packages/engine/   pure TS, no I/O: puzzle + protocol types, key notation,
                   headless replay, match rules (lock-in, grace, scoring).
                   Imported by everything else.
apps/web/          Svelte 5 + Vite SPA, CodeMirror 6 + @replit/codemirror-vim
apps/server/       Bun.serve: static files, WebSocket rooms, matchmaker
puzzles/           handmade puzzles as JSON (data, not code)
```

Shared rules, the stack, release and deploy come from lsel's `CLAUDE.md` and
`STACK.md`; this file holds only this project's traps.

## Working here

- **Validate from the repo root:** `bun run check` (tsc, svelte-check, biome,
  lsel-check), `bun run test`, `bun run build`, then `bun run test:e2e`.
  `bunfig.toml` (happy-dom and Svelte preloads) is read from the cwd only, so
  `bun test` in a subdirectory runs without DOM globals.
- **The CSP allows inline styles**, unlike lsel's: CodeMirror injects `<style>`
  elements. `CSP` in `apps/server/src/server.ts` goes to `serve()`;
  `e2e/built.e2e.ts` fails if CodeMirror goes unstyled.
- Don't build ahead of the build order in `docs/decisions.md`: no GitHub
  login, ratings or ghosts before step 6.

## Workspace traps

- Root scripts can't call member bins: the isolated linker puts `vite` and
  `svelte-check` only in their workspace's `.bin`. Use `bun run --filter`.
- Pin every `@codemirror/*` in the root `catalog` and write `"catalog:"`: a
  second copy of `state` or `view` throws "Unrecognized extension value".
- `apps/web` deliberately lacks `@replit/codemirror-vim`, `@codemirror/commands`
  and `@codemirror/lang-*`; an import failing there is the "visuals only" guard.
- `typescript` stays 5.x or 6.x: svelte-check 4.7.7 refuses TS 7.
- Every `.svelte` file needs `<script lang="ts">`, even empty; without it
  svelte-check reports TS7016 at the importer (no `allowJs`).

## Invariants

- **One key log, one result.** The browser and the server's headless replay must
  turn the same key log into the same buffer, or honest players get rejected.
  Every editor extension comes from `engine`'s shared config; the web app adds
  only visuals (theme, gutters, diff highlight), never anything that edits text.
- **No text-editing helpers in the editor**: closeBrackets, autocomplete,
  auto-indent-on-input, etc. would type characters the key log doesn't show.
- **No line wrapping, no folding.** Headless replay makes `j`/`k` logical-line
  moves (CM6 measures pixels otherwise); wrapping on the client breaks parity.
- **The server owns time.** Lock-in and grace deadlines use server receive time;
  client timestamps are display-only.
- Keys are vim notation strings (`"a"`, `"<Esc>"`, `"<C-v>"`), one array entry
  per keystroke (VimGolf convention). **The score is the count since the last
  reset marker**, and the server replays only that tail; the whole log is
  still stored for replays and mismatch reports.
- **Undo steps never depend on wall-clock time.** The client types with
  pauses, the replay runs instantly; a time-grouped `u` diverges.

## Oracle traps

- `*.vim.json` fixtures are written only by `bun run oracle`, and
  `oracle/deviations.json` only by `oracle/pin.ts` after deciding a difference
  stays; never edit them by hand. CI never runs vim: after adding or changing
  cases, or a nixpkgs bump that moves vim, run `bun run oracle` yourself.
- `bun run oracle` and `bun run test:browser` need the dev shell's vim and
  browsers: `nix develop -c …` (the system vim answers differently).

## Nix traps

- `bun.nix` comes from the root `postinstall: bun2nix -o bun.nix`, which needs the
  dev shell's `bun2nix`: run `bun install` inside it after any dependency change,
  or the Nix build uses a stale `bun.nix`. The Nix build would rerun it without,
  hence `dontRunLifecycleScripts` in every `package.nix`, which also skips any
  dependency's own install script.

## Engine traps (codemirror-vim, headless)

Found while building the engine; each needs a test in `engine` before it is
"handled".

- **Vim state is process-global** (registers, macros, search, last `:s`),
  shared by every editor in the process. `createSession` resets it, so never
  call `replay()` while a live session on the page still accepts keys.
- `Vim.handleKey` does not insert text in insert mode (the browser's input event
  does). The replayer must `replaceSelection` unhandled keys itself.
- `cm.openDialog` is both the `:`/`/` prompt and the macro "recording" banner.
  Only prompts pass `onKeyDown`; capturing the banner swallows every later key.
- Never replay via `:normal` / mappings: keys from a mapping skip macro
  recording and collapse undo, so macros and `u` silently break.
- `EditorState.allowMultipleSelections` must be on, or the core's block
  operators (`d`, `r`, `~`, `p`) only edit the first line.
- Needs DOM globals (happy-dom) even headless; `Window` among them.
  `test/dom.ts` installs them with `??=`, so Bun's own `Event` and `navigator`
  win: build test events with `window.Event`.
- In key notation vim regex `\<` is `\<lt>`: `/\<foo\>` fails to parse because
  `<foo\>` reads as a key name.
- **The core is patched** (`patches/@replit%2Fcodemirror-vim-core@0.1.0.patch`):
  the engine's hooks (`Vim.exHook`, `vimRegExp`, `adjustOperatorRange`,
  `onFailure`, `repeatInsert`) do nothing without it. `bun patch` copies the
  package to root `node_modules/@replit/`, but the adapter imports the `.bun`
  store copy, so edits there don't run until `bun patch --commit`.
- An error thrown through the core's `handleKey` resets the vim state
  (marks, last edit): macro.ts catches errors inside a macro run.
- `evalInput` clears `vim.inputState` before calling a motion: read the pending
  operator from the motion's fifth argument. A keymap entry with
  `context: "normal"` never matches once an operator is pending.
- History transactions skip transaction filters (`filter: false`), so undo-step
  bookkeeping lives in the `u`/`<C-r>` actions (operators.ts), not history.ts.
- The core's macro recording (`q`, `@`, `isRecording`) and `:normal` are replaced
  in `vimSetup.ts`: it dropped ex commands and insert-mode cursor keys. Keys a
  core command replays run inside its vim operation, which defers change events;
  `createSession`'s `dispatch` detaches `cm.curOp`, or `.` and `3ix<Esc>` break.
- **Differs from vim, parity-safe:** every known case is pinned in
  `oracle/deviations.json` by group (`oracle/deviations.ts`); replace-mode
  `<BS>` moves left without restoring the character. Solutions must not rely on
  vim there (`puzzles/README.md`).
- `Transaction.time` in the engine is a logical undo-group id, not a clock
  (`history.ts`): never read it as time; `undo.test.ts` guards `u` parity.
