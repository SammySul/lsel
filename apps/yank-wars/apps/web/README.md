# @yank-wars/web

The solo client: puzzle list, round flow, split view with live diff. Run everything from the
repo root (`bunfig.toml` is read from the cwd only):

```sh
bun run dev     # vite dev server; DEV build, so the result card shows the self-check badge
bun run build   # production build into apps/web/dist
bun run check   # tsc (engine), svelte-check (web), biome
```

## Manual checklist

Until the Playwright parity suite exists (step 2), every change to key capture, the editor
config or the round flow is checked by hand. Run it under `bun run dev` in **Chrome, Firefox
and Safari on macOS, and Chrome on Windows**. Write down the browser and anything that fails.

**Parity (the DEV self-check badge must say `ok` every time):**

- [ ] Each of the ten puzzles, played to lock-in in each browser: the counter equals the keys
      you typed in the final run, and the badge says `ok`.
- [ ] Each case in `spikes/headless-replay/index.ts`, except the two known engine bugs
      (`jqqddjq3@q`, the recursive `@a`): add a scratch puzzle to `puzzles/handmade/` with the
      case's start and expected doc as `start`/`target` and its keys as `solution`, type the
      keys, and compare the counter and buffer with the badge. Three cases reach their doc
      before the last key, so the round would lock in before `.`/`u` are typed; use these
      instead (start → keys → target, all checked against vim):
      `one\ntwo\nthree` → `ddp.u0x` → `two\nne\nthree`; `one` → `ihello <Esc>ux` → `ne`;
      `one` → `ihello <Esc>..ux` → `hellohello one`. Delete the scratch puzzles afterwards,
      since `puzzles.test.ts` checks every file there.
- [ ] Along the way, use `u`, `.`, `R…<Esc>` followed by `.`, a recorded macro, visual block
      `I`, `:g`, `:sort`, `:norm` and `/` search at least once before locking in.

**Keyboard:**

- [ ] Shift+Space in insert mode inserts a space and counts as `<Space>`.
- [ ] On a German layout, `{` (AltGr+7 on Windows, Option+8 on macOS) types `{`.
- [ ] A dead key (`'` on US-International) shows the "dead keys are unsupported" hint, inserts
      nothing and does not count.
- [ ] Cmd (macOS) or Win combos do nothing and do not count; F-keys likewise.
- [ ] Holding a key repeats it, and every repeat counts as one key.
- [ ] Windows/Linux Chrome: the insert-mode status line shows the Ctrl+W hint.

**Mouse and clipboard:**

- [ ] Clicking in the buffer focuses the editor but does not move the cursor.
- [ ] Paste, drop, cut and the context menu do nothing in the buffer.
- [ ] The target pane cannot be focused, selected or typed into.
- [ ] The result card's Copy button (and `c`) copies the final run's notation.

**Round flow:**

- [ ] Study: both panes and the diff are visible, typing is swallowed, the ring counts down 5 s,
      and Space or Enter (or the Ready button) starts the clock early.
- [ ] `<C-CR>` (Ctrl+Enter) or the Reset button resets: the buffer goes back to the start, the
      counter goes to 0, "run 2" appears, the clock and cap bar keep running, and the pane flashes.
- [ ] `<C-S-L>` toggles relative/absolute line numbers; relative numbers follow the cursor; the
      choice survives a reload.
- [ ] `:` opens the prompt in the status line, `<Esc>` cancels it, `<Up>` recalls the last
      command, and a bad regex shows a message without stopping the round.
- [ ] `:w`, `:set`, `:map` show the "disabled" message and change nothing.
- [ ] Clicking outside the editor shows "Click to focus the editor"; clicking it resumes.
- [ ] Lock-in: input stops, the buffer pulses green, and the result card follows with keys vs par,
      time, runs, your solution, the par solution (`s`) and the personal best.
- [ ] `<C-S-CR>` (Ctrl+Shift+Enter) gives up ("Gave up"); letting the 4-minute cap run out
      shows "Time's up". Both offer retry on `r`.
- [ ] Result card keys: Enter goes to the next puzzle, `r` retries, Esc goes to the list.
- [ ] Puzzle list: `j`/`k`/arrows move, Enter opens, the personal best column fills in after a
      lock-in.
- [ ] HMR: editing a component under `bun run dev` updates the page without a full reload.

## Untested in step 1

- Real keyboards: the engine tests dispatch synthetic `KeyboardEvent`s under happy-dom, so
  native key delivery is covered only by the checklist above.
- IME and dead keys on each OS (blocked by design; only the hint is checked).
- HMR.
