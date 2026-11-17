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

## What a CLAUDE.md is for

Only traps: something that already went wrong here, or would, and that neither
the code nor upstream's docs make obvious. One or two lines each, with the why.
No descriptions of what code does, no history. When you touch something a note
describes, fix or delete the note.

## Working here

- **Nix dev shell** (`direnv allow`, or `nix develop`) provides bun and biome;
  nothing is installed globally. **Bun only** for install, test, run and
  `bun patch`; no npm, no npx.
- **Deploy is a Nix package + NixOS module**, imported by `squares` on `twelve`
  and exposed through its `cloudflared` tunnel (`typ` is the precedent). No
  Dockerfile.
- **Releasing is bumping `version`** in the root `package.json` and pushing
  `main`: CI tags it and `twelve` runs the tag within minutes. A tag that fails
  `twelve`'s health check is never retried, so fix forward with a new version.
- **Validate from the repo root:** `bun run check` (tsc, svelte-check, biome),
  `bun test`, `bun run build`. `bunfig.toml` (happy-dom preload) is read from the
  cwd only, so `bun test` in a subdirectory runs without DOM globals. Say
  plainly when something is untested, especially anything only checked headless.
- **Comments: one line or none**, only for a why the code can't show.
- **Commits: subject line only.** No body, no Co-Authored-By trailer.
- Don't build ahead of the build order in `docs/decisions.md`: no GitHub
  login, ratings or ghosts before step 6.

## Workspace traps

- Root scripts can't call member bins: the isolated linker puts `vite` and
  `svelte-check` only in their workspace's `.bin`. Use `bun run --filter`.
- Pin every `@codemirror/*` in the root `catalog` and write `"catalog:"`: a
  second copy of `state` or `view` throws "Unrecognized extension value".
- `apps/web` deliberately lacks `@replit/codemirror-vim`, `@codemirror/commands`
  and `@codemirror/lang-*`; an import failing there is the "visuals only" guard.
- Never run `biome migrate`: it rewrites `"preset": "recommended"` to `"none"`
  and switches the linter off; `bun run check` greps for it.
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

- **bun2nix 2.1.2 is patched** (`nix/bun2nix-lockfile-v2.patch`, upstream PR
  #110): bun ≥ 1.3 writes `lockfileVersion: 2`, which the release rejects as
  "Unsupported lockfile version", the npm `bun2nix` included, so only the dev
  shell's CLI can generate `bun.nix`. Drop the patch once a release has #110.
- `bun.nix` comes from the root `postinstall: bun2nix -o bun.nix`, which needs the
  dev shell's `bun2nix`: run `bun install` inside it after any dependency change,
  or the Nix build uses a stale `bun.nix`. The Nix build would rerun it without,
  hence `dontRunLifecycleScripts` in every `package.nix`, which also skips any
  dependency's own install script.
- `checks.x86_64-linux.module` is a NixOS VM test: run it on `twelve`
  (`nix build path:.#checks.x86_64-linux.module`), the mac has no Linux builder.
- A flake sees only git-tracked files: `git add` new files before `nix build`
  or `nix develop`, or it fails with "does not exist in Git repository".
- Package scripts put `node_modules/.bin` first on PATH: after dropping a
  dependency that shipped a binary, `rm -rf node_modules`, or the stale copy
  keeps running instead of the dev shell's (the npm `bun2nix` did exactly that).

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
