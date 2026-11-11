# Decisions

Each entry: what we chose, why, and what would make us revisit it.

## Game

**Hybrid scoring with a grace timer.** First to match locks in and starts a
grace timer; fewest keystrokes among finishers wins; tie goes to the earlier
finish; not finishing loses. Grace = 30% of the first finisher's time, clamped
to 10–60 s. Pure speed ignores macros; pure golf ignores speed. The grace window
makes "rush to start the clock" vs "golf for fewer keys" a choice every round.
*Revisit* the 30% after playtests, not before.

**Split view + live diff.** Your buffer left, read-only target right, with
unmatched lines highlighted in your buffer. The target pane is not a vim buffer,
so it can't be yanked from.

**Opponents' keystroke counts are visible live.** That visibility is where the
grace-timer tension comes from.

**Lock-in is automatic** the moment the buffer matches. No `:w`, no arguing
over whether `<Esc>` counts.

## Round rules

**Start: 5 s study, skippable.** Start and target are shown with input
disabled for 5 s; the clock starts when the study window ends or when every
player has pressed ready (Space/Enter, shown to the others), whichever is
first. Planning is part of the skill, but two eager players shouldn't wait.

**Score = keystrokes of the final run.** A reset key restores the starting
buffer and zeroes the counter, costing only time. Within a run every key
counts: `u`, backspace, `:`, searches. This is VimGolf's "best clean run"
with the race's clock as the price of exploring. The server replays only the
keys after the last reset marker; the full log is kept for replays.
*Rejected:* counting every key including resets (one dead end loses the golf
half of the round); free undo (the score stops meaning anything).

**Visual aids are free, editing aids are banned.** Relative line numbers
(default on, toggleable), syntax highlighting and the diff highlight never
touch the buffer. No vimrc, no mappings, no `:set`: mappings make keystroke
counts incomparable and the server has nothing to map against.

**Round cap: 4 minutes.** Nobody locked in by then is a draw. A forfeit key
ends a round early for a player who is stuck. *Revisit* if generated puzzles
turn out larger than 10–30 lines.

**Disconnects: 15 s to reconnect, then forfeit.** Keys live on the server, so
a reconnecting client rebuilds its buffer and resumes. Clocks never pause, so
dropping is never an advantage. *Rejected:* pausing (pull the plug to think).

**Room = series.** The invite link is the room id. Rematch keeps the room,
draws a new puzzle and keeps a running tally. Rooms close 5 minutes after the
last socket leaves.

**Identity: Better Auth.** Anonymous plugin from step 2 (every player has a
stable id and a nickname, no login screen), GitHub sign-in with account
linking (`onLinkAccount` moves history) in step 5 with ratings. Step 1 stays
client-only.

## Engine: CodeMirror 6 + @replit/codemirror-vim

A JS reimplementation of vim, actively maintained (6.4.0, July 2026), with an
API to intercept and replay keys (`Vim.handleKey`, `Vim.defineEx`).

Spike result (`spikes/headless-replay/index.ts`, 17/19 cases): motions, text objects,
`.`, undo, `:s`, `:g`, `:sort`, `:norm`, search, visual block and non-recursive
macros all replay correctly headless under Bun + happy-dom. Failures: macros
don't abort on a failed motion, and recursive macros overflow the stack. Both
are real vim-golf techniques, so we patch them (`bun patch`) in step 2, when
the headless replayer gives the fix a test on both sides, and open the upstream
PR at the same time. Solo play in step 1 ships with the bugs.

**Undo is vim-style and time-independent:** one step per normal-mode command
or insert session, never a wall-clock window, or `u` diverges between a client
typing with pauses and a replay running instantly. Proven by a parity test
before `u` is trusted; forced in the shared editor config if the engine
doesn't already behave that way (the spike suggests it does).

**Parity safeguards from day one:** the server stores every rejected lock-in
with its full key log so it can be reproduced in a test; in dev, the client
replays its own log in a hidden editor after lock-in and warns on divergence.
Playwright parity tests (type a log in a real browser, compare with replay)
once the editor config is stable. *Rejected:* trusting the client on mismatch.

*Rejected:* real Vim/Neovim on the server (a process per player, latency on
every key, shell lockdown); vim.wasm / nvim-wasm in the browser (experimental,
needs COOP/COEP headers, hard to intercept keys).
*Revisit* if players hit too many gaps that `bun patch` can't fix.

## Architecture: one Bun process, server-authoritative

One Bun server serves the built web app, the WebSocket rooms and the matchmaker,
all in memory. Clients edit locally (no input lag) and stream keys; the server
replays each player's log with the shared `engine`, owns the clock, and decides
results.

- **Why server-authoritative:** random matchmaking means strangers, and someone
  has to own the clock and verify finishes.
- **Why one process, not Cloudflare Durable Objects:** latency barely matters
  (only progress events cross the network), replay needs happy-dom, and one
  process is the least to run and debug. It handles a niche game for a long time.
- *Rejected:* WebRTC/P2P (no one owns the clock; still needs signaling and TURN;
  matchmaking needs a server anyway).
- *Revisit* when one box can't hold the concurrent rooms. The `engine` stays
  pure so rooms can move.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Dev environment | **Nix flake devShell** via direnv | How every project here works; nothing global, same toolchain on every machine and in CI |
| Runtime, package manager, tests | **Bun** (workspaces, `bun test`) | One tool for install, run, test and `bun patch` (needed for the engine fixes); native TS and WebSockets in `Bun.serve` |
| Frontend | **Svelte 5 + Vite**, SPA | Familiar from Maw; a handful of routes doesn't need SvelteKit. *Revisit* if routes or SSR needs grow |
| Editor | CodeMirror 6 + `@replit/codemirror-vim` | See Engine |
| Diff highlight | `@codemirror/merge` (its `diff`/`Chunk` only) | Same ecosystem; we render our own line decorations, since `MergeView` would own the editor |
| Server | `Bun.serve` (routes + websocket), no framework | A few HTTP routes and one socket; a framework would add more than it saves |
| Message validation | **Valibot**, at external boundaries only (puzzle JSON now, socket messages in step 2) | Small bundle on the web side; inside the boundary, trust the types |
| Lint/format | **Biome** + `svelte-check` | One fast tool; svelte-check covers what Biome doesn't in `.svelte` |
| E2E | **Playwright** (later) | Browser-vs-headless parity tests: type a key log in a real browser, compare with replay |
| Auth | **Better Auth** (1.7.x) with the anonymous plugin; GitHub provider later | Framework-agnostic `Request → Response` handler mounts on `Bun.serve`; guests get real user rows that link to a GitHub login without losing history; `bun:sqlite` supported natively |
| Database | **`bun:sqlite`** from step 2, one file in the service's state dir | Better Auth needs it anyway; puzzles stay files. Drizzle only if hand-written SQL for match history gets unwieldy |
| Domain | **yankwars.app** (owned) | `.app` is HSTS-preloaded: browsers refuse plain HTTP, so it's only ever served through the tunnel's TLS. Its DNS must live on Cloudflare for the tunnel to take the hostname |
| Deploy | **Nix package + NixOS module**, imported by `squares` into `twelve`; loopback port behind the existing `cloudflared` tunnel as `yankwars.app` | Same box and tunnel as `typ`, but Nix-built instead of a Docker Hub image, so the flake is the single source for dev, CI and prod. Single region is fine because latency barely matters. Bun deps are packaged with **bun2nix**: `fetchBunDeps` turns `bun.nix` into a Bun cache, `mkDerivation` compiles one binary. Proven on the replay spike (2026-10-30), `bun patch` patches included. bun2nix 2.1.2 carries our `nix/bun2nix-lockfile-v2.patch` until upstream PR #110 is released |
| CI | GitHub Actions running `nix develop -c bun run check` and `bun test` on PRs | Same shell as local, so no drift |

## Puzzles

**Generated daily**, as JSON. Two ways to run it; pick when step 3 starts:
a GitHub Action that commits to `puzzles/` (reviewable, versioned, but needs
a redeploy per day), or a systemd timer in the NixOS module writing into the
service's state dir (no redeploy; the natural fit once deploy is Nix). Handmade
puzzles live in the repo either way. The generator:

1. takes a 10–30 line chunk from a fixed list of MIT/Apache repos (credited
   with the puzzle);
2. applies a vim-shaped change (rename, swap arguments, change quote style,
   add/remove trailing commas, sort/join/split lines, wrap lines in a call,
   comment out a block) and writes a reference solution for it;
3. replays the reference solution with `engine`. If it reaches the target, the
   puzzle is kept and the solution's length becomes **par**; otherwise it's dropped.

A handful of handmade puzzles come first, so the generator never blocks
playing. VimGolf challenges only with the maintainer's permission (licence
unclear).

**Daily puzzle = solo fallback.** One puzzle per day is the same for everyone,
Wordle-style. With nobody in the queue you play the daily against par and see
today's best. Ghost replays (recorded key logs played back as an opponent) can
come later on the same data.

## Step 1 design (2026-10-31)

From the design workflow (3 researchers, 3 proposals, 3 judges, 1 synthesis);
the full spec is `docs/step1-spec.md`. "Parity by construction" won on every
judge's card over observing codemirror-vim natively.

**Key capture: the browser is one more replayer.** A `Prec.highest` keydown handler owned by the engine prevents every keydown and calls the same `feedKey()` the headless replay uses; codemirror-vim's own keydown handler, native insert-mode typing and its `<input>` command line never run. *Rejected:* observing the adapter and emulating native behaviour in the replayer (insert text would be labelled differently, prompt keys are DOM events on a panel input, Cmd+A moves the selection unlogged). *Revisit* only if an upstream API makes the adapter itself drivable without DOM.

**Undo grouping is a logical group id, not a clock.** A `transactionFilter` sets `Transaction.time` to the session's undo group (bumped per normal-mode key, per command during macro playback), relabels changes to `input.type`, and marks selection-only transactions `addToHistory: false`; `history({newGroupDelay: 1, joinToEvent: () => true})`. One step per normal command including its insert session, one per ex command, one per macro command. Verified against commands 6.11.1 / state 6.7.6; the catalog pin plus `undo.test.ts` (with `setSystemTime` jumps) is the upgrade gate.

**Vim regex syntax: `nopcre`.** `applyEngineOptions()` sets `pcre` false after every global reset so `/` and `:s` accept `\(` `\+` `\<`; `:set` is blocked so players cannot flip it. *Rejected:* JavaScript regex (the default) because golfers' muscle memory is vim's.

**`o`/`O`/insert `<CR>` insert a plain newline** (`CodeMirror.commands.newlineAndIndent` overridden; vim's `noautoindent`), and `cc`/`S` drop the indent too (a wrapping `change` operator). Removes the syntax tree from the most common insert path and makes `o` and `<CR>` consistent. The language stays engine config for `=`/`>>`/`<<`. *Revisit* if playtests want autoindent (both sides change in one place).

**Clipboard registers are the unnamed register.** The core touches `navigator.clipboard` in exactly two places, and both are closed: `RegisterController.prototype.pushText` maps `+`/`*` to no register, and the `paste` action is replaced by its own non-clipboard branch (`continuePaste`). So `"+p`, `:pu +`, `:y +` and `:g/x/pu +` never read the clipboard (async, unlogged) or write it. *Rejected:* overriding only `setRegister` (the first version; `:pu +` and `:y +` pass the register name straight to the core, found in review), and clearing `registerName` after each key (misses `"+p` inside a macro).

**Macros are keys, as in vim.** The engine owns `q`, `@` and `:normal` (`macro.ts`): a recording is the keys typed, stored one per register entry, and playback and `:normal` feed keys through the same per-key path as typing. The core recorded an insert session as a change list and never recorded ex commands, so `qq:s/a/b/<CR>jq@q` and `<Left>` or `<C-o>` inside a recorded insert replayed wrongly, and a played `:` left a prompt open that ate the next keys. Nesting deeper than 100 throws: a recursive macro used to run until the stack overflowed, at a depth that differs between browsers and between runs, so one log gave two results. On this path Chromium overflows at about 720 levels and Bun at about 2200 (measured 2026-11-11). *Revisit* the limit when step 2 makes a failing motion abort a macro, because then a recursive macro can stop on its own.

**Window-dependent motions run on a virtual 30-line window** (`H/M/L/<C-f>/<C-b>/<C-d>/<C-u>/gj/gk` via `Vim.defineMotion`; `<C-e>/<C-y>/zz/zt/zb` no-ops) and `findPosV` is line arithmetic on both sides. Puzzles are ≤ 30 lines and the pane is sized to show them all. *Revisit* if generated puzzles grow.

**UI chords: `<C-CR>` reset, `<C-S-CR>` forfeit, `<C-S-L>` line numbers, Space/Enter ready.** Layout-independent, never AltGr characters, not vim commands; intercepted before logging. The editor is a focus trap during a round (Tab, Meta combos and F-keys are prevented); copy happens from the result card. *Rejected:* Ctrl+Alt+R/N (collide with AltGr on US-International), F2/F3 (need Fn on Mac laptops).

**One key grammar: `<lt>` is the only spelling of `<`** in logs, solutions and result cards; `toCoreKey` maps it back at the engine boundary. `<Reset>` is a log marker never produced by `keyFromEvent`.

**Dead keys and IME are unsupported in step 1.** `Dead`/`Process`/`isComposing` keydowns are dropped and prevented, DOM text is swallowed, the status line shows a hint; puzzles are ASCII-only. *Revisit* when Playwright can verify per-browser dead-key delivery.

**Reset = fresh session.** `createSession` always runs `Vim.resetVimGlobalState_()` + `applyEngineOptions()`, so a client reset and the server's tail replay start from the same pristine engine. *Rejected:* `view.setState` (re-instantiates the vim plugin in place with stale patched references).

**Diff highlight uses `@codemirror/merge`'s `Chunk.build` only**, rendered as our own `Decoration.line`s. `MergeView`/`unifiedMergeView` own the views' dispatch and add widgets/accept-reject controls that edit text, violating 'every editor extension comes from engine'. Stack-table wording 'built-in line highlighting' is refined accordingly.

**Valibot validates puzzle JSON inside the engine** (`parsePuzzle` at the file boundary), amending 'at the socket boundary only': puzzle files are external data and step 2 reuses the same library for socket messages.

**Puzzle text has no trailing newline.** CM has no final line terminator and lock-in is `doc.toString() === target`; a trailing `\n` would be an extra empty line to create. Vim's implicit eol is not modelled.

**TypeScript 5.9.3 via the root catalog.** svelte-check 4.7.7 hard-rejects TS 7 (`ts-version-check.js`) and peers `^5 || ^6`; 6.0.3 is a verified drop-in. TS 7 later only as `@typescript/native` alias with `--tsgo`.

**Tooling layout:** Bun isolated linker (default) with a root catalog pinning every `@codemirror/*` (one copy, enforces web-cannot-edit), `bunfig.toml` at the root only (`[run] bun = true`, happy-dom test preload), Biome 2.5.15 legacy Svelte mode with the documented override and a CI grep for `preset: recommended`. happy-dom is a root devDependency for tests; step 2 adds it to the server.

### Step 1 deviations and deferrals

The deviations from vim behave the same in the browser and in the replay: they cost vim fidelity, never parity.

**The command line is append-only.** Inside `:`/`/`/`?`, `<Left>/<Right>/<Home>/<End>/<Del>/<Tab>` are counted no-ops and `<Tab>` neither completes nor cancels; `<BS>` on an empty prompt cancels, `<Up>/<Down>` recall history, `<C-u>` clears. The virtual prompt only forwards keys to the core's own handlers; a cursor inside the prompt would be emulation. *Revisit* if players miss editing the command line.

**Shift on a named key is the base key; unbound keys still count.** Shift+Space/Enter/Backspace/Tab/Delete/Escape/Insert log as `<Space>`, `<CR>`, … (terminal vim behaviour); `<S-Left>` and friends survive. F-keys, Meta combos and Dead/Process keys are dropped and not counted. `<C-v>`, `<PageUp>`, `<S-Left>` and other keys the core doesn't bind in insert mode count as a key and do nothing (the spike typed `<C-v>` as six characters).

**`/` and `:s` are always ignorecase+smartcase:** the core hard-codes both (`:s` calls `updateSearchQuery(cm, regex, true, true)`) and `:set` is blocked. Under nopcre, `&` in a `:s` replacement is a literal `&`; `\0` is the whole match.

**`<C-r>+` inserts nothing**, which follows from the clipboard registers being the unnamed register.

**Replace-mode `<BS>` moves left without restoring the replaced character** (vim restores it), and `.`/`@q` afterwards repeat only what was typed after the last `<BS>`: adapter behaviour, inherited on both sides. Without `<BS>`, `R…<Esc>` then `.`/`@q`/counts match vim: `feedKey` wraps the adapter's `overWriteSelection` in one vim operation, because its selection-only first dispatch otherwise reads as a cursor move and drops all but the last character from the `.` record (an upstream adapter bug, so the stock browser path has it too).

**`:map`, `:set`, `:w` and `:colorscheme` (every alias) are blocked with a status message** instead of failing as unknown commands; `:w` says lock-in is automatic.

**Vim state is process-global, so replays are serial.** `createSession` resets it, so a page never replays while its live session accepts keys (the DEV self-check runs after lock-in), and step 2's server must serialise replays. The engine's `:normal` never uses the core's module-private `keyToKeyStack`, which the reset doesn't clear; `replay.test.ts` runs a recursion inside `:norm @q` into the depth limit and then checks that prompts still work.

**Chrome on Windows/Linux reserves Ctrl+W/T/N,** so insert-mode `<C-w>` can close the tab. The status line shows a hint; nothing is remapped.

**The 4-minute cap applies to solo rounds too,** with retry on one key (`r`) from the result card.

**The engine supersedes the spike's replayer.** `feedKey` takes the adapter's own path (`multiSelectHandleKey` with `vim.status` appended first, not `handleKey`), prompt keys go through the core's handlers (the spike's `<Esc>` skipped `clearInputState` and left `d:` pending), `<BS>` is `deleteCharBackwardStrict` plus explicit `InsertModeKey` recording, replace mode overwrites, and `forceParsing` runs after every key. The spike's shortcuts passed its 19 cases but would have diverged from the browser; the engine's parity suite is now the reference.

**Deferred to step 2** beyond the build order below: the root `postinstall` and `bun.nix` with the first `package.nix`, the Playwright parity suite, and optionally upstreaming `InsertModeKey` recording as a core patch. A recursive macro now stops at 100 levels in milliseconds, but a large count (`999@q`) still runs synchronously; the server must bound it.

## Project

Public repo on Sammy's personal GitHub account, **MIT**. Matches the other
projects, keeps the upstream engine PR and puzzle-source credits simple.

## Build order

0. Done (2026-10-30): `nix build .#headless-replay` packages the spike with
   bun2nix; a throwaway `bun patch` proved patches survive the route
1. Solo, client-only: editor, split view, live diff, key counter, reset key,
   lock-in, study window; ~10 handmade puzzles
2. Server: rooms via invite link, grace timer, round cap, reconnect, headless
   replay with mismatch logging, Better Auth anonymous sessions on `bun:sqlite`,
   engine patches + upstream PR, NixOS module on `twelve` as `yankwars.app`
3. Generator + daily puzzle page (Action vs systemd timer decided here)
4. Matchmaking queue with daily/solo fallback
5. Only if people rematch: GitHub login + linking, ratings (Glicko-2 /
   OpenSkill), ghosts
