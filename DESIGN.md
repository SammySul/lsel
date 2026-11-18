# Design

One look for everything: the terminal's. Dark only, monospace, square, quiet.
The values live in `theme/` and reach projects as `tokens.css` (`bun run
sync`); use the variables, never the hex values.

## Palette

Rosé Pine Moon on a near-black base, the same palette the terminal, nvim and
the desktop use (`squares` imports it from here).

| Variable | Use |
|---|---|
| `--base` | page background |
| `--raise`, `--surface` | panels, rows, inputs: one step up each; depth comes from these steps, never from shadows |
| `--overlay` | borders and dividers |
| `--highlight` | text selection |
| `--text` | body text |
| `--subtle` | secondary text, on `--base` or `--raise` only |
| `--muted` | disabled and decorative text only: it fails AA for reading |
| `--accent` | focus, links, the primary action, the selected row's left bar, a pressed toggle's border; as text it sits on `--base` only (it fails AA on anything raised) |
| `--error`, `--warning`, `--success` | states; text in a state color sits on `--base`, so a selected row or a pressed toggle gets a border, not a fill |
| `--select` | the text cursor |
| `--term-0` … `--term-15` | the terminal's 16 colors, for syntax and charts |

Readable pairs are pinned by `theme/contrast.test.ts` (WCAG AA, 4.5:1). Text
on a filled `--accent` button is `--base`.

A project may add a content palette for its art (lsel-station's pixel art);
the interface around it still uses these variables.

## Type

- **JetBrains Mono, everywhere**: interface and code, Regular (400) and Bold
  (700) only, self-hosted (`tokens.css` loads the `.woff2` files beside it; the
  OFL license ships with them). No other family, except a pixel display face
  for a game's title.
- Sizes: `--text-xs` 12, `--text-sm` 14 (body), `--text-md` 16, `--text-lg`
  20, `--text-xl` 28; `--text-display` 40 for the one number a screen is about
  (a score, a timer). Line height 1.5.
- Sentence case everywhere, including buttons and headings.

## Shape

- **No rounding**: `border-radius: 0` on everything (`tokens.css` sets it).
- 1px borders in `--overlay`; no shadows, gradients, blur or transparency
  effects.
- A page's content sits in `main`, which `tokens.css` frames with a border and
  a gap to the window; the app sets only its `max-width` and padding. A popup
  has no `main`: the browser frames it.
- Spacing on a 4px grid: `--space-1` … `--space-7` (4, 8, 12, 16, 24, 32, 48).

## Elements

`tokens.css` styles buttons (outlined on `--base`; a pressed toggle has an
accent border), selects, inputs, `kbd`, links, `h1`/`h2`, `pre` blocks and
tables. Apps use those elements as they are and keep their own CSS to layout; a
component may extend an element (a column's alignment, a color that carries
meaning), never restyle it, by element or by a class on it (`.chip` on a
button).

## Interaction

- **Keyboard first**: every action has a key, and the key is shown next to it
  (`<kbd>`). `j`/`k` move, `Enter` opens, `Esc` backs out, `/` searches, `?`
  lists the keys.
- Focus is always visible: `--focus`, a 2px accent outline.
- Nothing only works on hover or with a mouse.
- **Motion is subtle and on by default**, one curve (`--ease`): controls ease
  their color and border changes (`--motion-fast`, 150 ms, set by
  `tokens.css`); content that appears or swaps fades in (`.lsel-appear`,
  `--motion`, 200 ms); charts animate to new values (`--motion-slow`, 300 ms).
  Nothing moves for decoration, except inside a game's scene (lsel-station's
  stars). `prefers-reduced-motion` stops all of it: the CSS through
  `tokens.css`, anything driven from JavaScript (Chart.js, the Web Animations
  API, a canvas) by checking the media query itself.

## Icon

A project's favicon is its first letter, lowercase, in JetBrains Mono Bold, in
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
