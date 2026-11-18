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
- A view change must not wait for `hashchange`: the event arrives a task
  later, and a key pressed right after `5` acted on the old department.
  `select` sets the state first and the address second.
- The game's seed is random per page load, so anything rolled (mastery's
  double output, kept input) differs between runs: a browser test asserts
  those amounts with a pattern, and exact numbers only before mastery 10.
- **An `AudioContext` is created only inside a key press or click** that
  counts as an activation (`navigator.userActivation`; Esc does not). Made any
  earlier, Firefox logs a console warning, which fails the quiet-console test.
- The audio clock ignores `page.clock`: a browser test waits for a context's
  state in real time (`contextState`), and a `fastForward` is a catch-up, which
  is silent by design; use `runFor` for the few seconds a sound test needs.
