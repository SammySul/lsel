# Decisions

Each entry: what we chose, why, and what would make us revisit it.

## Game

**Hybrid scoring with a grace timer.** First to match locks in and starts a
grace timer; fewest keystrokes among finishers wins; tie goes to the earlier
finish; not finishing loses. Grace = 30% of the first finisher's time, clamped
to 10–60 s. Pure speed ignores macros; pure golf ignores speed. The grace window
makes "rush to start the clock" vs "golf for fewer keys" a choice every round.
_Revisit_ the 30% after playtests, not before.

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
_Rejected:_ counting every key including resets (one dead end loses the golf
half of the round); free undo (the score stops meaning anything).

**Visual aids are free, editing aids are banned.** Relative line numbers
(default on, toggleable), syntax highlighting and the diff highlight never
touch the buffer. No vimrc, no mappings, no `:set`: mappings make keystroke
counts incomparable and the server has nothing to map against.

**Round cap: 4 minutes.** Nobody locked in by then is a draw. A forfeit key
ends a round early for a player who is stuck. _Revisit_ if generated puzzles
turn out larger than 10–30 lines.

**Disconnects: 15 s to reconnect, then forfeit.** Keys live on the server, so
a reconnecting client rebuilds its buffer and resumes. Clocks never pause, so
dropping is never an advantage. _Rejected:_ pausing (pull the plug to think).

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

**Parity safeguards:** the server stores every rejected lock-in with its full
key log so it can be reproduced in a test; in dev, the client replays its own
log after lock-in and warns on divergence; `web/e2e/parity.e2e.ts` types every
oracle case in three browsers. _Rejected:_ trusting the client on mismatch.

_Rejected:_ real Vim/Neovim on the server (a process per player, latency on
every key, shell lockdown); vim.wasm / nvim-wasm in the browser (experimental,
needs COOP/COEP headers, hard to intercept keys).
_Revisit_ if players hit too many gaps that `bun patch` can't fix.

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
- _Rejected:_ WebRTC/P2P (no one owns the clock; still needs signaling and TURN;
  matchmaking needs a server anyway).
- _Revisit_ when one box can't hold the concurrent rooms. The `engine` stays
  pure so rooms can move.

## Stack

| Concern            | Choice                                                                                | Why                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend           | **Svelte 5 + Vite**, SPA                                                              | Familiar from Maw; a handful of routes doesn't need SvelteKit. _Revisit_ if routes or SSR needs grow                                                                                 |
| Editor             | CodeMirror 6 + `@replit/codemirror-vim`                                               | See Engine                                                                                                                                                                           |
| Diff highlight     | `@codemirror/merge` (its `diff`/`Chunk` only)                                         | Same ecosystem; we render our own line decorations, since `MergeView` would own the editor                                                                                           |
| Server             | `Bun.serve` (routes + websocket), no framework                                        | A few HTTP routes and one socket; a framework would add more than it saves                                                                                                           |
| Message validation | **Valibot**, at external boundaries only (puzzle JSON now, socket messages in step 2) | Small bundle on the web side; inside the boundary, trust the types                                                                                                                   |
| Lint/format        | **Biome** + `svelte-check`                                                            | One fast tool; svelte-check covers what Biome doesn't in `.svelte`                                                                                                                   |
| Auth               | **Better Auth** (1.7.x) with the anonymous plugin; GitHub provider later              | Framework-agnostic `Request → Response` handler mounts on `Bun.serve`; guests get real user rows that link to a GitHub login without losing history; `bun:sqlite` supported natively |
| Database           | **`bun:sqlite`** from step 2, one file in the service's state dir                     | Better Auth needs it anyway; puzzles stay files. Drizzle only if hand-written SQL for match history gets unwieldy                                                                    |
| Domain             | **yankwars.app** (owned)                                                              | `.app` is HSTS-preloaded: browsers refuse plain HTTP, so it's only ever served through the tunnel's TLS. Its DNS must live on Cloudflare for the tunnel to take the hostname         |

## Puzzles

**Handmade only (2026-11-16).** Every puzzle is a file in `puzzles/handmade/`,
written and reviewed like code; Claude writes most of them, and the puzzle tests
(the solution reaches the target on its last key, par pinned in `PAR`) are the
gate. _Rejected:_ the generator (repo excerpts plus scripted vim-shaped edits):
mechanical edits make samey, tedious puzzles, and it needed license tracking
and a daily job.

**Easy first.** Most puzzles are short: one or two vim ideas, solved in
seconds. The list starts with the easiest and harder ones stay a minority;
easy ones are the most fun. VimGolf challenges only with the maintainer's
permission (license unclear).

**Daily puzzle = solo fallback.** One puzzle per day is the same for everyone,
Wordle-style, picked from the handmade pool on a fixed rotation, so no job and
no redeploy. With nobody in the queue you play the daily against par and see
today's best. Ghost replays (recorded key logs played back as an opponent) can
come later on the same data.

## Step 1 design (2026-10-31)

"Parity by construction" won over observing codemirror-vim natively.

**Key capture: the browser is one more replayer.** A `Prec.highest` keydown handler owned by the engine prevents every keydown and calls the same `feedKey()` the headless replay uses; codemirror-vim's own keydown handler, native insert-mode typing and its `<input>` command line never run. _Rejected:_ observing the adapter and emulating native behavior in the replayer (insert text would be labelled differently, prompt keys are DOM events on a panel input, Cmd+A moves the selection unlogged). _Revisit_ only if an upstream API makes the adapter itself drivable without DOM.

**Undo grouping is a logical group id, not a clock.** A `transactionFilter` sets `Transaction.time` to the session's undo group (bumped per normal-mode key, per command during macro playback), relabels changes to `input.type`, and marks selection-only transactions `addToHistory: false`; `history({newGroupDelay: 1, joinToEvent: () => true})`. One step per normal command including its insert session, one per ex command, one per macro command. Verified against commands 6.11.1 / state 6.7.6; the catalog pin plus `undo.test.ts` (with `setSystemTime` jumps) is the upgrade gate.

**Vim regex syntax: `nopcre`.** `applyEngineOptions()` sets `pcre` false after every global reset so `/` and `:s` accept `\(` `\+` `\<`; `:set` is blocked so players cannot flip it. _Rejected:_ JavaScript regex (the default) because golfers' muscle memory is vim's.

**`o`/`O`/insert `<CR>` insert a plain newline** (`CodeMirror.commands.newlineAndIndent` overridden; vim's `noautoindent`), and `cc`/`S` drop the indent too (a wrapping `change` operator). Removes the syntax tree from the most common insert path and makes `o` and `<CR>` consistent. The language stays engine config for `=`/`>>`/`<<`. _Revisit_ if playtests want autoindent (both sides change in one place).

**Clipboard registers are the unnamed register.** The core touches `navigator.clipboard` in exactly two places, and both are closed: `RegisterController.prototype.pushText` maps `+`/`*` to no register, and the `paste` action is replaced by its own non-clipboard branch (`continuePaste`). So `"+p`, `:pu +`, `:y +` and `:g/x/pu +` never read the clipboard (async, unlogged) or write it. _Rejected:_ overriding only `setRegister` (the first version; `:pu +` and `:y +` pass the register name straight to the core, found in review), and clearing `registerName` after each key (misses `"+p` inside a macro).

**Macros are keys, as in vim.** The engine owns `q`, `@` and `:normal` (`macro.ts`): a recording is the keys typed, stored one per register entry, and playback and `:normal` feed keys through the same per-key path as typing. The core recorded an insert session as a change list and never recorded ex commands, so `qq:s/a/b/<CR>jq@q` and `<Left>` or `<C-o>` inside a recorded insert replayed wrongly, and a played `:` left a prompt open that ate the next keys. Nesting deeper than 100 throws: a recursive macro used to run until the stack overflowed, at a depth that differs between browsers and between runs, so one log gave two results. On this path Chromium overflows at about 720 levels and Bun at about 2200 (measured 2026-11-11). _Revisit_ the limit when step 2 makes a failing motion abort a macro, because then a recursive macro can stop on its own.

**Window-dependent motions run on a virtual 30-line window** (`H/M/L/<C-f>/<C-b>/<C-d>/<C-u>/gj/gk` via `Vim.defineMotion`; `<C-e>/<C-y>/zz/zt/zb` no-ops) and `findPosV` is line arithmetic on both sides. Puzzles are ≤ 30 lines and the pane is sized to show them all. _Revisit_ if generated puzzles grow.

**UI chords: `<C-CR>` reset, `<C-S-CR>` forfeit, `<C-S-L>` line numbers, Space/Enter ready.** Layout-independent, never AltGr characters, not vim commands; intercepted before logging. The editor is a focus trap during a round (Tab, Meta combos and F-keys are prevented); copy happens from the result card. _Rejected:_ Ctrl+Alt+R/N (collide with AltGr on US-International), F2/F3 (need Fn on Mac laptops).

**One key grammar: `<lt>` is the only spelling of `<`** in logs, solutions and result cards; `toCoreKey` maps it back at the engine boundary. `<Reset>` is a log marker never produced by `keyFromEvent`.

**Dead keys and IME are unsupported in step 1.** `Dead`/`Process`/`isComposing` keydowns are dropped and prevented, DOM text is swallowed, the status line shows a hint; puzzles are ASCII-only. _Revisit_ when Playwright can verify per-browser dead-key delivery.

**Reset = fresh session.** `createSession` always runs `Vim.resetVimGlobalState_()` + `applyEngineOptions()`, so a client reset and the server's tail replay start from the same pristine engine. _Rejected:_ `view.setState` (re-instantiates the vim plugin in place with stale patched references).

**Diff highlight uses `@codemirror/merge`'s `Chunk.build` only**, rendered as our own `Decoration.line`s. `MergeView`/`unifiedMergeView` own the views' dispatch and add widgets/accept-reject controls that edit text, violating 'every editor extension comes from engine'.

**Valibot validates puzzle JSON inside the engine** (`parsePuzzle` at the file boundary), amending 'at the socket boundary only': puzzle files are external data and step 2 reuses the same library for socket messages.

**Puzzle text has no trailing newline.** CM has no final line terminator and lock-in is `doc.toString() === target`; a trailing `\n` would be an extra empty line to create. Vim's implicit eol is not modelled.

### Step 1 deviations and deferrals

The deviations from vim behave the same in the browser and in the replay: they cost vim fidelity, never parity.

**The command line has a cursor** (superseded 2026-11-11): `<Left>/<Right>/<Home>/<End>/<Del>/<BS>/<C-w>` edit at the cursor, `<C-r>{reg}`, `<C-r><C-w>` and `<C-v>{key}` insert, `<Tab>` is a literal tab in a `:` line (nothing to complete) and nothing in `/`, as in vim 9.2. `<BS>` on an empty prompt cancels, `<Up>/<Down>` recall history, `<C-u>` clears.

**Shift on a named key is the base key; unbound keys still count.** Shift+Space/Enter/Backspace/Tab/Delete/Escape/Insert log as `<Space>`, `<CR>`, … (terminal vim behavior); `<S-Left>` and friends survive. F-keys, Meta combos and Dead/Process keys are dropped and not counted. `<C-v>`, `<PageUp>`, `<S-Left>` and other keys the core doesn't bind in insert mode count as a key and do nothing.

**`/` and `:s` are always ignorecase+smartcase** (`:set` is blocked; the oracle runs vim with the same options). `&` in a `:s` replacement is the match, as in vim (superseded 2026-11-11: it was literal under the core's nopcre).

**`<C-r>+` inserts nothing**, which follows from the clipboard registers being the unnamed register.

**Replace-mode `<BS>` moves left without restoring the replaced character** (vim restores it), and `.`/`@q` afterwards repeat only what was typed after the last `<BS>`: adapter behavior, inherited on both sides. Without `<BS>`, `R…<Esc>` then `.`/`@q`/counts match vim: `feedKey` wraps the adapter's `overWriteSelection` in one vim operation, because its selection-only first dispatch otherwise reads as a cursor move and drops all but the last character from the `.` record (an upstream adapter bug, so the stock browser path has it too).

**`:map`, `:set`, `:w` and `:colorscheme` (every alias) are blocked with a status message** instead of failing as unknown commands; `:w` says lock-in is automatic.

**Vim state is process-global, so replays are serial.** `createSession` resets it, so a page never replays while its live session accepts keys (the DEV self-check runs after lock-in), and step 2's server must serialize replays. The engine's `:normal` never uses the core's module-private `keyToKeyStack`, which the reset doesn't clear; `replay.test.ts` runs a recursion inside `:norm @q` into the depth limit and then checks that prompts still work.

**Chrome on Windows/Linux reserves Ctrl+W/T/N,** so insert-mode `<C-w>` can close the tab. The status line shows a hint; nothing is remapped.

**The 4-minute cap applies to solo rounds too,** with retry on one key (`r`) from the result card.

## Engine fidelity: oracle, patches, browser parity (2026-11-11)

**Vim is the oracle.** Expected values come from the dev shell's pinned vim (`bun run oracle` writes `engine/oracle/cases/*.vim.json`), so nobody runs a manual browser checklist.

**Where fixes live, in order of preference:** an engine override in `engine/src/vim/`, the same code on both sides; else a `bun patch` of `@replit/codemirror-vim-core` (`patches/@replit%2Fcodemirror-vim-core@0.1.0.patch`). Our own ex layer, `:s`, `:sort`, search and regex dialect replace the core's because the core's parsing (ranges, flags, counts, escapes, cursor rules) was wrong in too many places to patch one by one.

**The core patch, hunk by hunk, for upstreaming** (each is a bug fix or a small hook; the hooks are what an upstream API would offer):

- hooks on `Vim`: `vimRegExp` (nopcre patterns), `exHook` (command lines), `adjustOperatorRange` (exclusive/linewise operator ranges), `onFailure` (a failed motion), `repeatInsert` (`.` of an insert from typed keys); `defineMotion/Action/Operator` return what they replace, so an override can wrap it;
- `*`/`#` build a vim pattern (`\<word\>`), and a canceled search keeps the previous pattern instead of re-parsing a JS source;
- failed `f t ; , %` and symbol motions return null, so an operator does nothing (vim beeps); `a<`/`i<` no longer throw in a unicode-mode `RegExpCursor`;
- `y` leaves the cursor at the start of what it yanked; a yank is not a change for `.`; charwise `P` and `p` on an empty line end on the last character put; `gp`/`gP` and `<C-o>p` end after the text;
- a linewise delete through the last line takes the line break before it, and the register holds only the lines;
- visual `c`/`C`/`S` on lines leave one empty line (was: joined with the next); visual `S` is linewise in every visual mode; a charwise selection ending at a line's end takes the line break; visual-line `~ u U g? p` leave the cursor in column 0.

**Macros abort like vim's typeahead.** Macros live in `macro.ts` and replay through `typeahead()`: a key that fails (a motion returning null via the core's `onFailure` hook, a thrown ex or core error, `J` on the last line, `r` past the end, `<C-a>` with no number) ends the running macro, every enclosing `@` level and the rest of a `3@q` count, as vim flushes typeahead. `:normal` stops only its own keys. Errors are caught inside the macro so they never unwind through the core's `handleKey` (which would reset the vim state). A recursion that never fails still stops at `MAX_MACRO_DEPTH` (vim itself would run forever). A macro run is one undo step (`u` after `3@q` undoes all of it).

**Undo cursor is vim's** (`u_undoredo()`): back where the change began when that position is inside the changed lines, otherwise the first changed line's first non-blank. The undo step's starting cursor is recorded per step in `history.ts`.

**Browser parity fixes.** The core's raw insert-mode keydown listener recorded `<BS>`/`<Del>` a second time in browsers (`cm.getInputField()` now returns a detached object); a typed `<` armed the core's 200 ms insert-keymap timer (bypassed); `browserInput` drops any transaction that does not come from a fed key (Firefox moved the DOM selection after some redraws, WebKit on right-click); `:sort` is stable in every JS engine; Ctrl+Shift+2 is `<C-@>` (Shift is part of a symbol).

### Engine deviations from vim

Every oracle case that still differs from vim is listed by reason in `engine/oracle/known.ts`; the suite fails if a listed case starts matching vim. _Rejected:_ pinning each difference's exact engine output (until 2026-11-26): browser parity is checked against the live engine, so the snapshots only added upkeep; a 3k-case fuzz corpus (removed 2026-11-17), whose differences were never reduced to a cause.

_Accepted:_ the fixed 30-line window for `<C-d>`/`<C-f>`/`H`/`L`, replace-mode `<BS>` not restoring, insert completion and digraphs, and `\=` expressions in `:s` being an error (an expression evaluator for a feature golfers rarely use was dropped on 2026-11-26). Everything else in `known.ts` is a bug, ordered by how likely golfers hit it.

Visual-block `I`, `A`, `c`, `s`, `C`, `D`, `X` and `Y` follow vim since 2026-11-12 (`engine/src/vim/blockInsert.ts`, cases in `oracle/cases/visual-block.ts`): an insert types on the first line only and is copied to the other lines at `<Esc>` or `<C-o>`, skipping lines too short for `I`/`c` and padding them for `A`.

## Rooms (2026-11-26)

**Two players, an invite link.** A third gets "room full". The round's puzzle is
random from the whole pool, one the room hasn't played first, so the pool's mix
(mostly easy and medium) sets the odds: two players each picking a difficulty
in the lobby was chaotic. Names are typed, remembered in
prefs, and editable in the lobby; accounts come with part 3.

**The cap wins over grace.** A lock-in at 3:55 leaves 5 s, not 10: the
4-minute cap is a promise about how long a round can take.

**A match is a claim.** The client sends the log's length and its buffer; the
server replays that log and only then locks the player in, at the time the
claim arrived (the replay's duration never costs anyone). A rejected claim
keeps the player in the round and writes one line to `mismatches.jsonl` (the
log, both buffers; capped at 10 MB), which is how parity bugs get found.

**Replays run in one worker** compiled into the binary (`bun build --compile`
with the worker as an extra entrypoint; CI's smoke test plays a claim against
the built binary). Over 2 s, a replay is rejected as too slow and the worker is
restarted, which bounds `999@q` without an engine change and drops vim's
process-global state with it. _Rejected:_ replaying on the main thread (one
slow claim stalls every socket).

**Protocol:** JSON frames on `/ws`, parsed with Valibot (`engine/src/game/protocol.ts`),
every client frame stamped with `PROTOCOL` (2 since rooms stopped picking a
difficulty); a frame from another version gets `reload`,
so an old tab after a deploy refreshes. The server sends durations, never
timestamps, so client clocks don't matter; state frames go out at most every
100 ms per room. Frames are capped at 16 KB, 60 per second per socket.

**The rules are a pure reducer** (`server/src/room.ts`, like `reduceRound`),
with sockets, timers and the worker in a thin shell, so every rule is tested on
a fake clock. In the client, a round played in a room is the solo
`RoundController` with a `RoundLink`: the room starts and ends it, and hears
every key.

**Reconnects:** the seat token lives in `sessionStorage`, so a reload keeps the
seat and a second tab gets its own. A reload types the room's copy of the log
into a fresh buffer; a dropped socket retries for the 15 s the seat is held and
resends what the server missed. Rooms are in memory: a deploy ends them, and the
client says so.

## Project

Lives in lsel under `apps/yank-wars` (since 2026-11-21), MIT; release and
deploy are lsel's (`STACK.md`).

## Build order

0–3. Done (2026-11-17, `v1.0.0`): the solo game live at `yankwars.app`, ~50
handmade puzzles. The daily puzzle page comes after v1
4. Rooms (step 2 parts 2 and 3): part 2 done 2026-11-26 (invite links, grace
timer, round cap, reconnect, replay with mismatch logging); part 3 next: Better
Auth anonymous sessions on `bun:sqlite`, upstream PRs for the core patch
5. Matchmaking queue with daily/solo fallback
6. Only if people rematch: GitHub login + linking, ratings (Glicko-2 /
OpenSkill), ghosts
