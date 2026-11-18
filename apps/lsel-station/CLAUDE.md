# lsel-station

Shared rules come from lsel's `CLAUDE.md`; this file holds only this project's
traps.

- **Browser tests stop the page clock** (`page.clock`) and move it with
  `fastForward`. `runFor` fires every timer and frame on the way and runs past
  bun's 5 s test timeout; bun then kills the browser, and every later test
  fails with "browser has been closed".
- The scene's draw effect must read only values that rarely change (`seed`,
  `size`, `still`): reading `game.snapshot` there repaints the planet and
  starfield on every tick.
