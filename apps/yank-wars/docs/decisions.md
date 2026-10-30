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

Spike result (`spikes/headless-replay.ts`, 17/19 cases): motions, text objects,
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
| Diff highlight | `@codemirror/merge` | Same ecosystem; built-in diff and line highlighting |
| Server | `Bun.serve` (routes + websocket), no framework | A few HTTP routes and one socket; a framework would add more than it saves |
| Message validation | **Valibot**, at the socket boundary only | Small bundle on the web side; inside the boundary, trust the types |
| Lint/format | **Biome** + `svelte-check` | One fast tool; svelte-check covers what Biome doesn't in `.svelte` |
| E2E | **Playwright** (later) | Browser-vs-headless parity tests: type a key log in a real browser, compare with replay |
| Auth | **Better Auth** (1.7.x) with the anonymous plugin; GitHub provider later | Framework-agnostic `Request → Response` handler mounts on `Bun.serve`; guests get real user rows that link to a GitHub login without losing history; `bun:sqlite` supported natively |
| Database | **`bun:sqlite`** from step 2, one file in the service's state dir | Better Auth needs it anyway; puzzles stay files. Drizzle only if hand-written SQL for match history gets unwieldy |
| Domain | **yankwars.app** (owned) | `.app` is HSTS-preloaded: browsers refuse plain HTTP, so it's only ever served through the tunnel's TLS. Its DNS must live on Cloudflare for the tunnel to take the hostname |
| Deploy | **Nix package + NixOS module**, imported by `squares` into `twelve`; loopback port behind the existing `cloudflared` tunnel as `yankwars.app` | Same box and tunnel as `typ`, but Nix-built instead of a Docker Hub image, so the flake is the single source for dev, CI and prod. Single region is fine because latency barely matters. *Unproven:* packaging Bun deps reproducibly; `bun2nix` (a separate flake, not in nixpkgs) is the candidate, a fixed-output `bun install` the fallback. Prove one before step 2 ships |
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

## Project

Public repo on Sammy's personal GitHub account, **MIT**. Matches the other
projects, keeps the upstream engine PR and puzzle-source credits simple.

## Build order

0. Spike: package `spikes/headless-replay.ts` as a flake output (bun2nix, else
   fixed-output `bun install`) to prove the Nix route and that `bun patch` files
   survive it
1. Solo, client-only: editor, split view, live diff, key counter, reset key,
   lock-in, study window; ~10 handmade puzzles
2. Server: rooms via invite link, grace timer, round cap, reconnect, headless
   replay with mismatch logging, Better Auth anonymous sessions on `bun:sqlite`,
   engine patches + upstream PR, NixOS module on `twelve` as `yankwars.app`
3. Generator + daily puzzle page (Action vs systemd timer decided here)
4. Matchmaking queue with daily/solo fallback
5. Only if people rematch: GitHub login + linking, ratings (Glicko-2 /
   OpenSkill), ghosts
