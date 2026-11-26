# Step 2 spec

Part 1, packaging and deploying the solo game, is live at `https://yankwars.app`.
Part 2 is specified below; part 3 is an outline, specified in full before it
starts. Build order and rationale: `docs/decisions.md`.

## 2. Rooms

Two players race on the same puzzle through an invite link. No
accounts yet (part 3): a player is a seat in a room, with a name they type.

### Rules (from `decisions.md`, made concrete)

- **Lobby.** A room opens in its lobby and holds two players; a third gets
  "room full". The round starts once both are connected and have pressed
  Enter.
- **Study, then play.** 5 s study, ended early when both press
  Space/Enter. Then the 4-minute cap starts, on the server's clock.
- **Lock-in.** A player's client claims a lock-in when its buffer matches; the
  server replays the claimed run and accepts or rejects it. The lock-in time is
  when the claim arrived, not when its replay finished.
- **Grace.** The first accepted lock-in at `t` (ms since the start) starts the
  grace timer: `clamp(0.3 × t, 10 s, 60 s)`. The round ends at the earlier of
  grace's end and the cap (the cap wins: a lock-in at 3:55 leaves 5 s), or as soon as both players have locked in, forfeited
  or dropped.
- **Winner.** Fewer keys (since the last reset) wins, then the earlier lock-in;
  a player who didn't lock in loses. Neither locked in: a draw.
- **Series.** The room keeps a tally (one point per round won). On the result
  card `r` asks for a rematch; the next round starts when both
  players have asked, with a puzzle this room hasn't played yet.
- **Puzzle choice.** Random from the handmade pool at the room's difficulty:
  easy by default, set in the lobby with the list's keys (`1` easy, `2` medium,
  `3` hard, `0` any). Any player may change it while in the lobby.
- **Live view.** Each player sees the opponent's name, key count, run number and
  state (studying, playing, locked in at N keys, forfeited, disconnected).
  Never their buffers.
- **Disconnects.** A dropped player has 15 s to come back with the same seat; the
  clock never pauses. Not back in time: forfeit in a round, gone from a lobby.
  A room closes 5 minutes after its last socket leaves, and on a server restart
  (a deploy ends every room; the client says so).

### Protocol

JSON text frames on `GET /ws`, with Valibot schemas and types in
`engine/src/protocol.ts`; the server parses every frame and closes the socket
on one that doesn't parse. Every client frame carries `v: 1`; a server on
another version answers `{ t: "reload" }` (old tab after a deploy).

Client to server:

- `hello { room?, seat?, name }`: join a room (`room` missing: create one);
  `seat` is the token from an earlier `welcome`, to take that seat back.
- `lobby { ready: boolean, difficulty? }`
- `ready {}`: skip the study window.
- `keys { round, from, entries }`: log entries (keys and reset markers)
  starting at index `from` of this round's log. A resend after a reconnect
  overlaps; the server keeps entries it already has and appends the rest.
- `claim { round, length, doc }`: the client's buffer matched after the first
  `length` log entries; `doc` is that buffer, kept only for a mismatch report.
- `forfeit { round }`, `rematch {}`

Server to client:

- `welcome { room, seat, you, state }`: `state` is the whole room (below), and
  on a reconnect mid-round it includes your own log so the client can rebuild
  its buffer by feeding it.
- `state { … }`: phase (`lobby`, `study`, `playing`, `results`), round number,
  puzzle id, players (seat id, name, connected, lobby-ready, score, runs,
  status, lock-in time), tally, difficulty, and the time left in the current
  phase and grace in ms. Times are durations, so client clocks never matter;
  the client counts down from receipt.
- `verdict { ok, score?, reason? }` for your claim, and `result { winner,
  tally }` when the round ends.
- `error { code, message }`, `reload {}`

Sent on every change, throttled to 10 per second per room; a `keys` frame
updates the opponent's key count.

Limits: frames up to 16 KB, 5 000 log entries per round, 60 frames per second
per socket (over that: close). Room ids are 10 characters of base32 from
`crypto.getRandomValues`; seat tokens are 128-bit, never shown.

### Server

- **One process, in memory** (`server/src/rooms.ts`): a `Room` is a pure state
  machine (`reduceRoom(state, event, now)`, like `reduceRound`) plus a thin
  shell that owns sockets and timers. Events are client frames, timer fires and
  verdicts; timers come from an injected scheduler so tests run on a fake
  clock.
- **Replay worker** (`server/src/replay.worker.ts`): one `Worker` with
  happy-dom's globals, running `verifyRun(puzzle, log)` for one claim at a time
  from a FIFO queue. A replay over 2 s is rejected with reason `too slow`, and
  the worker is terminated and restarted (vim's process-global state dies with
  it). This bounds `999@q` and runaway recursion without an engine change.
  _Rejected:_ a queue on the main thread (one slow replay stalls every socket).
- **Mismatches** (a rejected claim): the player stays in the round; one line of
  JSON goes to `mismatches.jsonl` in the working directory (`/var/lib/yank-wars`
  on `twelve`, already backed up): time, puzzle id, the whole log, the claimed
  length, the client's doc, the replay's doc and errors. Capped at 10 MB, then
  it stops writing and logs that once.
- **Puzzles**: `puzzles/index.ts` imports every handmade JSON statically so the
  compiled binary embeds them; a test fails when a file in `puzzles/handmade/`
  is missing from it. The web app keeps its `import.meta.glob`.
- **WebSockets in the kit**: `serve()` gains a `websocket` option and passes
  `server` to `routes` so a route can `server.upgrade(req)`. A kit minor bump;
  the other apps don't change.
- **The binary**: `nix/app.nix` gains extra entrypoints for
  `bun build --compile` so the worker is embedded. This is the riskiest piece,
  so it is built first (below).

### Client

- The front page gets **Play a friend** (`f`): creates a room and opens
  `#/r/<id>`. The share line and result card of a solo round offer it too.
- **Lobby screen**: the invite link with `c` to copy, the name field
  (remembered in prefs), both players, the difficulty, Enter for ready.
- **Round screen**: the solo round's screen with the opponent's name, keys
  and state and the grace bar under the clock once it runs. A local
  match sends `claim` and shows "checking…" until the verdict; a rejected claim
  says "the server disagrees, keep going" and the buffer stays editable.
- `RoundController` takes a **driver**: the solo driver is today's clock and
  `reduceRound`; the room driver takes phase changes and deadlines from
  `state` frames and sends keys, claims and forfeits. The editor, HUD and key
  capture are shared.
- **Result card**: the winner, both scores and times, the tally; `r` asks for a rematch,
  Esc leaves the room.
- **Reconnect**: on a dropped socket the client retries with backoff (0.5 s, 1
  s, 2 s, …, within the 15 s), keeps typing into its buffer, and resends its
  unsent entries after `welcome`. A failed reconnect shows the room as lost.

### Tests

- `engine`: protocol schemas accept and reject frames (literal examples).
- `server/src/rooms.test.ts` on a fake clock: start conditions, study skip,
  grace length at the clamp edges, the cap cutting grace short, the winner and
  ties, the draw, forfeit and drop during grace, rematch, a third player,
  overlapping `keys` resends, a frame flood.
- `server/src/replay.test.ts`: a correct claim, a wrong one, a `999@q`-style
  claim rejected as too slow with the next claim still verified.
- Server integration: two real WebSocket clients against `Bun.serve` play a
  round to its result, and one reconnects mid-round.
- `web/e2e/room.e2e.ts`: two browser contexts play a room in each browser,
  including a reload mid-round.
- The compiled binary: a check builds `.#yank-wars`, starts it, and plays one
  claim over a WebSocket, so the embedded worker is proven, not assumed.

### Order of work

1. Spike the risk: a worker in a `bun build --compile` binary, through Nix,
   replaying one claim. Kit `websocket` support.
2. Protocol schemas, `reduceRoom` and its tests.
3. Server shell: sockets, timers, replay worker, mismatches, integration test.
4. Client: driver split, lobby, room round, result card, reconnect, e2e.
5. Docs: `decisions.md` gets what was decided here; this part of the spec is
   deleted once built.

## 3. Identity and records (outline)

- Better Auth with the anonymous plugin, `bun:sqlite` in the state directory.
  `squares` backs up `/var/lib/private/yank-wars` nightly with restic, which
  copies files as they are: write a consistent snapshot first (`VACUUM INTO`
  or the `-predump` convention in `squares`), never rely on the live file.
- Rejected lock-ins and finished rounds stored; the upstream PRs for the core
  patch go out alongside.
