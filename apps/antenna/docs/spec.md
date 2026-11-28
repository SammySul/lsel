# Antenna: game specification

A daily solo word game in the browser: name the rarest correct answer you can
think of. You tune in, a meter shows how faint your answer's signal is before
you commit, and you transmit once per prompt.

Status: concept and decisions agreed 2026-11-28; nothing built yet.

- **Locked**: Sammy's call. **Default**: Claude's, to confirm. **Open**: to ask.
- Stack and look are `STACK.md` and `DESIGN.md`; where this is silent, they
  decide. Every number is tunable.

## 1. Pillars

1. **You see your odds before you commit.** The meter is the game: no
   surprise verdicts, no rejected-then-explained answers.
2. **The judge is fair.** Hand-checked answer lists, aliases and typo
   tolerance; no LLM judge. A valid answer that's missing can be reported.
3. **Three minutes, once a day.** Same prompts for everyone, short animations,
   no account needed to play.
4. **Solo, but not alone.** First finders, a board and a share card; nobody has
   to be online together.

| Area    | Decision                                                                      |
| ------- | ----------------------------------------------------------------------------- |
| Players | Solo daily (Locked)                                                           |
| Social  | First finders, a global board, a share card; no groups, no live play (Locked) |
| Meter   | Exact bars live while typing (Locked)                                         |
| Prompts | Claude writes 90 before launch, Sammy reviews (Locked)                        |
| Look    | The lsel look, Signals theme (Locked)                                         |
| Folder  | `lsel/apps/antenna` (Locked); domain open until deploy                        |

## 2. A day

- **5 prompts**, the same for everyone, midnight to midnight UTC, day n is the
  nth id in `prompts/daily.json`, append-only (yank-wars' daily).
- Per prompt: **30 s**. You type; on every pause (150 ms) the server answers
  with the meter: no signal (not a valid answer), or the matched answer's name
  and its strength in 5 bars, fewer bars fainter.
- **One transmit per prompt** (`Enter`). Out of time transmits what's on the
  meter if it's valid, else scores 0.
- After each prompt, one line: your answer, its bars, its points, and its
  first finder. `Enter` goes on at once; nothing waits on an animation.
- After the fifth: the day's score, the five maps (section 4), the board,
  the share card. Past days are playable, unscored.

## 3. Rarity and score

- **Share** of an answer: Dirichlet-smoothed. Prior from Wikipedia page views
  (multi-year median of monthly views, log scale; Wikidata sitelinks break
  ties), strength k = 50; plus today's transmits from unique accounts.
  share = (n + k·p) / (N + k).
- **Bars**: share ≥ 10% → 5 bars, ≥ 3% → 4, ≥ 1% → 3, ≥ 0.3% → 2, below → 1.
- **Points**: 5 bars 10, 4 → 25, 3 → 50, 2 → 75, 1 → 100. A day is out of 500.
- **The score is what the meter showed** at transmit: locked then, never
  recomputed (Default). Counts refresh every minute, so the meter can drift
  during a day as people play; that drift is the reason to play early.
- The prior is checked against the Banks et al. 2021 category norms
  (CC BY 4.0, osf.io/jgcu6) before launch: bars should rank as people name.

## 4. The map

Each prompt's answers drawn on a 2D canvas as a dial: loud answers near the
center, faint ones at the edge, yours marked in `--accent`. Shown whole only
after you've transmitted that prompt, with today's counts and first finders.
It is the share card's image too. Reduced motion: drawn at once.

## 5. Answers

- **Content as files**, server-only: `prompts/<id>.json` holds the prompt, its
  answers (Wikidata id, name, aliases, prior) and a deny-list of near misses.
  The answers never reach the browser except one at a time through the meter.
- **Built by a script** (`bun run prompt`): a Wikidata SPARQL query (labels in
  `en,mul`) plus page views and Wikipedia redirects, then a hand pass on
  every list (Somaliland, _Planes_). Wikidata is CC0; Wikipedia redirects
  need no attribution as names.
- **Matching**: NFKD, case, accents, punctuation and a leading "the" dropped;
  aliases and redirects; Damerau-Levenshtein 0 edits up to 4 letters, 1 up to
  8, 2 beyond, accepted only if the nearest answer beats the next by a clear
  margin (Niger is never Nigeria).
- **"This should count"**: after a prompt, a rejected guess can be reported in
  one key; reports land in SQLite for a hand pass, never auto-accepted.

## 6. Players and social

- **Accounts as yank-wars has them**: a Better Auth guest made on first
  transmit, GitHub sign-in links it (Default). This is the second app with
  accounts, the daily schedule and a board, so they move into the kit
  (`@sammysul/lsel/server`), and yank-wars moves onto it in the same change.
- **First finder**: the first account to transmit an answer on its day is named
  on it, on the map and in the result line.
- **Global board**: the day's scores, ties broken by the earlier finish; one
  row per account and day.
- **Share card**: the five maps as one image (no answers on it) and a text
  line with the day, score and streak.
- **Streaks** are days played, in prefs and on the account.

## 7. Integrity

- The server owns validity, time and score; the client's timer is display.
- The meter endpoint is rate-limited per account and address.
- Counts are unique accounts; new guests weigh less in the share until they've
  played 3 days; live counts are never shown during a prompt.
- Collusion can move rarity, never validity.

## 8. Screens and keys

- `#/` today: the prompt, the field, the meter, the timer (`--text-display`).
  `Enter` transmits, `Esc` clears the field.
- `#/day/<n>` a past day; `#/board`; `?` keys.
- One `Page fill`; the field stays above a phone's keyboard
  (`visualViewport`). Words, states, motion: `DESIGN.md`.

## 9. Build order

0. Kit: accounts, daily schedule and board lifted from yank-wars; yank-wars
   on them, released.
1. Prompt pipeline and 90 prompts, hand-checked, Sammy reviews them in one
   batch; prior checked on the norms.
2. The game with the meter and score, guest accounts, today and past days.
3. Map, result lines, first finders, share card.
4. Board, "this should count" reports.
5. Deploy on twelve (`squares`), domain.
