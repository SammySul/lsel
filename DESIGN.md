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
| `--highlight` | selected or hovered row fill |
| `--text` | body text |
| `--subtle` | secondary text, on `--base` or `--raise` only |
| `--muted` | disabled and decorative text only: it fails AA for reading |
| `--accent` | focus, links, the primary action, the selected marker |
| `--error`, `--warning`, `--success` | states; `--success` text only on `--base` |
| `--select` | text selection, the cursor |
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
  20, `--text-xl` 28; line height 1.5.
- Sentence case everywhere, including buttons and headings.

## Shape

- **No rounding**: `border-radius: 0` on everything (`tokens.css` sets it).
- 1px borders in `--overlay`; no shadows, gradients, blur or transparency
  effects.
- Spacing on a 4px grid: `--space-1` … `--space-7` (4, 8, 12, 16, 24, 32, 48).

## Interaction

- **Keyboard first**: every action has a key, and the key is shown next to it
  (`<kbd>`). `j`/`k` move, `Enter` opens, `Esc` backs out, `/` searches, `?`
  lists the keys.
- Focus is always visible: `--focus`, a 2px accent outline.
- Nothing only works on hover or with a mouse.
- Motion only shows a change of state, at `--motion` (120 ms); none for
  decoration. `prefers-reduced-motion` turns it off (`tokens.css`).

## Words

- Plain and short. Say what happened or what to do; no exclamation marks, no
  emoji.
- US spelling, 12-hour clock (3:05 PM); metric units and Celsius.
- Numbers with their unit; durations as `m:ss.t` where precision matters.

## Not

- No light theme, no theme toggle.
- No icon fonts, no third-party fonts, scripts or trackers (strict CSP:
  `default-src 'self'`).
- No modal unless the user asked for it; no toasts that need dismissing.
