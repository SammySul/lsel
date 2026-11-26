# Step 2 spec

Part 1, packaging and deploying the solo game, is live at `https://yankwars.app`.
Part 2, rooms, is built (its decisions are in `docs/decisions.md`). Part 3 is an
outline, specified in full before it starts.

## 3. Identity and records (outline)

- Better Auth with the anonymous plugin, `bun:sqlite` in the state directory.
  `squares` backs up `/var/lib/private/yank-wars` nightly with restic, which
  copies files as they are: write a consistent snapshot first (`VACUUM INTO`
  or the `-predump` convention in `squares`), never rely on the live file.
- Rejected lock-ins and finished rounds stored; the upstream PRs for the core
  patch go out alongside.
