# Step 2 spec

Part 1, packaging and deploying the solo game, is live at `https://yankwars.app`.
Parts 2 and 3 are outlines, specified in full before each starts. Build order
and rationale: `docs/decisions.md`.

## 2. Rooms (outline)

Specified before it starts; decisions already made are in `docs/decisions.md`
(Round rules, Architecture).

- Invite link `#/r/<id>`; a room is a series with rematch in place.
- Protocol types and Valibot schemas in `engine`, versioned: join, ready, keys
  (with reset markers), progress, lock-in claim, grace start, result.
- The server owns time: lock-in and grace deadlines use receive time; round
  cap 4 minutes; 15 s to reconnect, then forfeit.
- Replay of the scored tail on each lock-in claim. Vim state is
  process-global, so replays are serialized; to decide here: a queue on the
  main thread or one replay worker (happy-dom in a `Worker`) so a slow replay
  can't stall the sockets. Bound macro counts (`999@q`).
- Mismatch handling: a rejected lock-in keeps the player in the round and logs
  key log, puzzle and both buffers.
- Open: grace timer length, what the opponent sees live (key count, lines off,
  nothing).

## 3. Identity and records (outline)

- Better Auth with the anonymous plugin, `bun:sqlite` in the state directory.
  `squares` backs up `/var/lib/private/yank-wars` nightly with restic, which
  copies files as they are: write a consistent snapshot first (`VACUUM INTO`
  or the `-predump` convention in `squares`), never rely on the live file.
- Rejected lock-ins and finished rounds stored; the upstream PRs for the core
  patch go out alongside.
