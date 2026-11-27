# Design

One look for everything, taken from the terminal: dark, square, quiet.
The values live in `theme/` and reach every app as `tokens.css` in
`@sammysul/lsel`; use the variables, never the hex values. The package's
components (`Page`, `Tabs`, `Toggles`, `List`, `Grid`, `Status`, `Empty`,
`Action`, `Field`, `Swap`) are these rules in code: use them rather than rebuilding them.
A piece the layout rules need (a fitted grid, a stable label) goes into the kit
at once, so no app hand-rolls layout; any other piece waits for a second app.

## Palette

fsociety: near-black with a cold grade, grey-white text and one red accent,
the same palette the terminal, nvim and the desktop use (`squares` imports it
from here). There is one palette and no light mode; the system's setting
changes nothing.

| Variable                            | Use                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--base`                            | page background                                                                                                                                             |
| `--raise`, `--surface`              | panels, rows, inputs: one step up each; depth comes from these steps, never from shadows                                                                    |
| `--overlay`                         | borders and dividers                                                                                                                                        |
| `--highlight`                       | text selection                                                                                                                                              |
| `--text`                            | body text                                                                                                                                                   |
| `--subtle`                          | secondary text, on `--base` or `--raise` only                                                                                                               |
| `--muted`                           | disabled and decorative text only: it fails AA for reading                                                                                                  |
| `--accent`                          | focus, links, the primary action, the selected row's left bar, a pressed toggle's border; as text it sits on `--base` only (it fails AA on anything raised) |
| `--error`, `--warning`, `--success` | states; text in a state color sits on `--base`, so a selected row or a pressed toggle gets a border, not a fill                                             |
| `--scanline`                        | the page background's scanlines; darker than `--base`, so whatever reads on `--base` reads on them                                                          |
| `--select`                          | the text cursor                                                                                                                                             |
| `--term-0` … `--term-15`            | the terminal's 16 colors, for charts                                                                                                                        |
| `--base00` … `--base0F`             | the palette in base16's slots, for syntax highlighting, as nvim colors code (yank-wars' editors)                                                            |

Readable pairs are pinned by `theme/contrast.test.ts` (WCAG AA, 4.5:1). Text on a filled `--accent` button is `--base`.

An app may add a content palette for its art (lsel-station's pixel art);
the interface around it still uses these variables.

## Type

- **Cantarell for the interface, DejaVu Sans Mono for code** (Kali's GNOME
  pair): `--font` and `--font-mono`, Regular (400) and Bold (700) only,
  self-hosted and subset to the Latin, punctuation and symbol blocks
  (`tokens.css` loads the `.woff2` files beside it; their licenses ship with
  them). Mono covers
  `pre`, `code`, `kbd` and an app's code-editing surface.
- **MrRobot for the app's name only** (`--font-display`, the show's title
  face, capitals only, Regular): the `Page` header's name and the favicon, in
  `--accent`. No other family, except a pixel display face for a game's title.
- Sizes: `--text-xs` 12, `--text-sm` 14 (body), `--text-md` 16, `--text-lg`
  20, `--text-xl` 28; `--text-display` 40 for the one number a screen is about
  (a score, a timer). Line height 1.5.
- Sentence case everywhere, including buttons and headings.

## Shape

- **No rounding**: `border-radius: 0` on everything (`tokens.css` sets it).
- 1px borders in `--overlay`; no shadows, gradients, blur or transparency
  effects. The one texture is the terminal's: faint scanlines on the page
  background (`tokens.css`: a 1px `--scanline` line every 2px), under all
  content and never over it. Panels, rows, inputs and buttons paint their own
  background, so the lines show only where the page does.
- A page's content sits in `main`, which `tokens.css` frames with a border and
  a gap to the window (`--frame-gap`, smaller on a phone); `Page` draws it and
  sets its `max-width` (`width`) and padding.
- Spacing on a 4px grid: `--space-1` … `--space-7` (4, 8, 12, 16, 24, 32, 48).

## Layout

An app screen fits the window and holds still. `lselLayout()` checks both in
every app's browser tests, at 1280×800 and 390×844 (`LAYOUT_SIZES`).

- **The page never scrolls.** What can grow (rows, tiles) goes in a fitted
  `List` (`fit`) or a `Grid`: it takes the height left and pages instead of
  growing, a `List` with `h`/`l`, a `Grid` with `PgUp`/`PgDn` (its
  `h`/`l` move between tiles). A screen with one working area (a game, an
  editor) is a `Page fill`, its children taking the height left with the
  page's gap between them; a fitted `List` in it takes the rows that room
  leaves.
- **Nothing moves by itself.** What arrives later (loading, polling, a timer)
  takes space kept for it from the start; only the user's own key or click may
  move things (folding the key hints, an error under a submitted field).
  - A line that may appear (waiting, a count, a warning) has its place from the
    start, empty until then.
  - Controls that load later (players, filters) keep their row
    (`--control-height`): a row of toggles is a `Toggles`, a line high (two on
    a phone) from the start, which pages with `[`/`]` rather than cutting off
    what doesn't fit. A label that changes keeps
    its widest width (`Swap`, `Action`).
  - A list or grid keeps its height through loading, filtering and paging,
    fillers included; an empty one says so in its place.
  - Inside a fitted frame, text stays on one line, cut with an ellipsis: a wrap
    would change the row count. Secondary detail goes in the pager row
    (`foot`), on a line of its own when the pager is narrow (under 480px: a
    phone, a sidebar), there even when empty.
- **The list or grid gets the height.** Related controls group with
  `--space-3`, sections with the page's gap; prose that would wrap on a phone
  is cut short instead.
- `tokens.css` does its part: fonts load with `font-display: optional` (a late
  font would move every line it sets).

## Elements

`tokens.css` styles buttons (outlined on `--base`; a pressed toggle has an
accent border), selects, inputs, `kbd`, links, `h1`/`h2`, `pre` blocks and
tables. Apps use those elements as they are and keep their own CSS to layout; a
component may extend an element (a column's alignment, a color that carries
meaning), never restyle it, by element or by a class on it (`.chip` on a
button).

## Interaction

- **Keyboard first**: every action has a key, and the key is shown next to it
  (`<kbd>`). `j`/`k` move (`h`/`l` too in a `Grid`), `Enter` opens, `Esc`
  backs out, `/` searches, `?` lists the keys. A page's main keys sit under its title (`Page` draws them);
  `K` or the Keys button folds them away, remembered per app. A touch screen
  (`pointer: coarse`) has no keys to show: `Page` hides the hints and the Keys
  button, and `tokens.css` the `<kbd>` in buttons and links. Prose that names a
  key ("`R` loads the rest") is the app's to word or hide there.
- Focus is always visible: `--focus`, a 2px accent outline, there at once (its
  color is never eased).
- Nothing only works on hover or with a mouse. Hover marks a control only where
  the pointer can hover (`hover: hover`): on a touch screen a tapped button
  would stay marked.
- **Motion is subtle and on by default**, and even: `--ease` (ease-in-out)
  for what changes, `--ease-out` (settling in) for what appears, never a lurch.
  Controls ease their color and border changes (`--motion-fast`, 150 ms, set
  by `tokens.css`); content that appears or swaps fades in (`.lsel-appear`,
  `--motion`, 180 ms); charts animate to new values (`--motion-slow`, 300 ms).
  The loading bar glides edge to edge and back, 1.6 s each way.
  Nothing moves for decoration, except inside a game's scene (lsel-station's
  stars) and the terminal's glitch: when the app opens, the screen changes
  (`route.path`) or the tab comes back, `Page` tears the title and the frame
  for 200 ms, in bands shifted sideways with a red/cyan split (`--accent`,
  `--term-14`), by transforms and clip-paths only, so nothing in the page
  moves. Never within a second of a keystroke into a field, and only `Page`
  glitches: an app adds none of its own. `prefers-reduced-motion` stops all
  of it: the CSS through `tokens.css`, anything driven from JavaScript
  (Chart.js, the Web Animations API, a canvas, the glitch) by checking the
  media query itself.

## States

Anything that waits, fails or comes back empty says so in words, where its
content would be (`resource()` with `Status`, `Empty`, `Action`, `Field`). A view's status line is `role="status"`; an error that stops
the user is `role="alert"`.

- **Loading**: one line in `--subtle` naming what it waits for ("Asking
  PUBG…", not "Loading…"), and a 2px `--accent` bar sliding along the top of the
  window (`Page` draws it; still under reduced motion), both shown
  only after 300 ms so a fast answer doesn't flash. The bar floats over the page
  and never moves it. A refresh keeps the old content on screen. No spinners or
  skeletons; a progress bar in the content only when the progress is known (a
  download).
- **Empty**: why it's empty and how to fill it, with the key ("No puzzles
  match. `0` shows every difficulty."). Never a blank area or a bare table
  header.
- **Error**: in `--error`, what failed and what to do, with `r` to retry where
  retrying can help. The last good content stays, with when it was fetched. An
  upstream's failure names the upstream ("PUBG is rate limiting; try again at
  3:05 PM").
- **Partial**: show what loaded, and one line counting what didn't.
- **Busy**: the control that started an action says what it's doing
  ("Downloading…"), is disabled and `aria-busy`; nothing else locks unless it
  would conflict.
- **Done**: confirmed in place, briefly ("Copied", back after 2 s), or in
  `--error` in the same place if it failed. No toasts.
- **Invalid input**: `aria-invalid` on the field (`tokens.css` gives it an
  `--error` border) and the reason under it in `--error`, checked on blur or
  submit, never while typing.

## Icon

An app's favicon is its first letter in MrRobot (`--font-display`), in
`--accent` on `--base`, square: `nix run lsel#favicon -- <letter> >
favicon.svg` (the letter is a path, so no font is needed to show it).

## Words

- Plain and short. Say what happened or what to do; no exclamation marks, no
  emoji.
- US spelling, 12-hour clock (3:05 PM); metric units and Celsius.
- Numbers with their unit, in units people read: distances in km or m,
  durations as h:mm or m:ss (`m:ss.t` where precision matters), dates as
  "Nov 18, 9:16 PM".
- Remember a screen's choices (selection, view, filters) across reloads in
  `localStorage`; never search text or anything secret.

## Not

- No light theme, no theme toggle.
- No icon fonts, no third-party fonts, scripts or trackers (strict CSP:
  `default-src 'self'`).
- No modal unless the user asked for it; no toasts that need dismissing.
