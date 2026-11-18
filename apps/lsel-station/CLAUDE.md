# lsel-station

Shared rules come from lsel's `CLAUDE.md`; this file holds only this project's
traps.

- **Browser tests stop the page clock** (`page.clock`) and move it with
  `fastForward`. `runFor` fires every timer and frame on the way and runs past
  bun's 5 s test timeout; bun then kills the browser, and every later test
  fails with "browser has been closed".
- The scene's draw effect must read only values that rarely change (`seed`,
  `size`, `still`, `view`, `built`, `label`): reading `game.snapshot` there
  repaints the planet and starfield on every tick.
- A view change must not wait for `hashchange`: the event arrives a task
  later, and a key pressed right after `5` acted on the old department.
  `select` sets the state first and the address second.
- The game's seed is random per page load, so anything rolled (mastery's
  double output, kept input) differs between runs: a browser test asserts
  those amounts with a pattern, and exact numbers only before mastery 10.
- The map is never saved, only the seed: changing `generateMap` moves the
  sectors of every saved game. Bump `SAVE_VERSION` with a migration that keeps
  the old map (or remaps owned and revealed sectors), never edit it in place.
- A change to `GameState` needs `SAVE_VERSION` + 1 and a step in
  `MIGRATIONS` (`src/save/document.ts`): players' saves and the sync service's
  rows are all at the old version.
- **Every AudioContext promise is caught** (`resume`, `suspend`, `close`):
  Firefox rejects one still pending when the page navigates and logs it as an
  error, which fails the quiet-console tests.
- Catch-up yields with a `MessageChannel`, not a timer: `page.clock` fakes
  timers in tests, and a hidden tab slows them to once a minute.
- `?seed=<n>` fixes a game's seed; the browser tests use seed 7 wherever they
  assert sector names or rolled amounts.
- **An `AudioContext` is created only inside a key press or click** that
  counts as an activation (`navigator.userActivation`; Esc does not). Made any
  earlier, Firefox logs a console warning, which fails the quiet-console test.
- **CI on twelve has no audio device**: Firefox's and WebKit's AudioContext
  stays suspended there (Chromium fakes a device), so a sound test asserts the
  game's own calls (`audioSpy`), never `ctx.state === "running"`.
- In a sound test, `fastForward` is a catch-up, which is silent by design; use
  `runFor` for the few seconds of live play it needs.
- **Every send is `keepalive` and may outlive its page unanswered**: the
  link's `sent` and the service's `?sent=` settle it on the next load. Moving
  the link forward before an answer loses a save whose send failed.
- A browser test that closes a page must wait on the service for its last send
  (`revision` in `e2e/saves.test.ts`): the page's ", synced" may be from before.
