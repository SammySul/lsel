# yank-wars

Head-to-head vim golf in the browser. Everyone gets the same code and a target;
the first to match the target locks in and starts a grace timer for the rest;
fewest keystrokes among finishers wins, ties go to whoever finished first.
Rationale for every stack choice is in `docs/decisions.md`.

```
engine/           pure TS, no I/O, imported by everything else; its README
                   maps the folders (vim layer, input, game rules)
web/               Svelte 5 + Vite SPA, CodeMirror 6 + @replit/codemirror-vim
server/            serve() from @sammysul/lsel: the built web app and the rooms
puzzles/           handmade puzzles as JSON (data, not code)
```

Shared rules, the stack, release and deploy come from lsel's `CLAUDE.md` and
`STACK.md`; this file holds only this project's traps.

## Working here

- **CI also plays a room round against the Nix-built binary** (`server/smoke.ts`); run it
  after touching the protocol or the server: `nix develop -c bun apps/yank-wars/server/smoke.ts
  "$(nix build .#yank-wars --no-link --print-out-paths)"` from the repo root.
- **Run its scripts from `apps/yank-wars`**, not a subdirectory: `bun test`
  elsewhere runs without the happy-dom preload.
- **The CSP allows inline styles**, unlike lsel's: CodeMirror injects `<style>`
  elements. `CSP` in `server/src/config.ts` goes to `serve()`;
  `e2e/built.e2e.ts` fails if CodeMirror goes unstyled.
- Don't build ahead of the build order in `docs/decisions.md`: no ratings or
  ghosts before step 6.
- **The server won't start without `YW_AUTH_SECRET`** (32+ characters), on
  twelve or locally: `YW_AUTH_SECRET=$(openssl rand -hex 32) bun server/src/main.ts`.

- **`puzzles/daily.json` is append-only**: day n is its nth id, so removing or
  reordering an entry moves every later day, today's included. To retire a
  puzzle, swap in a new one at the same place; `bun run daily` appends new ones.

## Workspace traps

- Root scripts can't call member bins: the isolated linker puts `vite` and
  `svelte-check` only in their workspace's `.bin`. Use `bun run --filter`.
- `web` deliberately lacks `@replit/codemirror-vim`, `@codemirror/commands`
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

- `*.vim.json` fixtures are written only by `bun run oracle`; never edit them
  by hand. CI never runs vim: after adding or changing cases, or a nixpkgs bump
  that moves vim, run `nix develop -c bun run oracle` yourself (the system vim
  answers differently).

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
  `server/src/dom.ts` installs them with `??=`, so Bun's own `Event` and `navigator`
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
  bookkeeping lives in the `u`/`<C-r>` actions (undo.ts), not history.ts.
- The core's macro recording (`q`, `@`, `isRecording`) and `:normal` are replaced
  in `vimSetup.ts`: it dropped ex commands and insert-mode cursor keys. Keys a
  core command replays run inside its vim operation, which defers change events;
  `createSession`'s `dispatch` detaches `cm.curOp`, or `.` and `3ix<Esc>` break.
- **Differs from vim, parity-safe:** every known case is listed by reason in
  `oracle/known.ts`. Solutions must not rely on vim there (`puzzles/README.md`).
- `Transaction.time` in the engine is a logical undo-group id, not a clock
  (`history.ts`): never read it as time; `undo.test.ts` guards `u` parity.
