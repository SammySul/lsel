# engine

The browser and the server import this one package, so the same key log gives
the same buffer on both.

| Folder       | What it holds                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/vim/`   | Where `@replit/codemirror-vim` differs from vim, fixed to follow vim's own source                                                     |
| `src/input/` | Key notation (`<C-v>`, `<lt>`) and browser keyboard events turned into keys                                                           |
| `src/game/`  | Puzzle schema, round rules and scoring, the key log, the room protocol                                                                |
| `src/`       | The seam: `session.ts` builds an editor with the vim layer, `feedKey.ts` types one key into it, `replay.ts` runs a whole log headless |
| `oracle/`    | Tests only: the same keys through the real vim pinned in the dev shell, compared buffer, cursor and mode                              |

## `src/vim/`, one file per vim area

| File              | Vim area                                                                             |
| ----------------- | ------------------------------------------------------------------------------------ |
| `vimSetup.ts`     | Installs everything below into the core; blocks `:w`, `:set`, `:map`                 |
| `ex.ts`           | The `:` command line: ranges, and the commands golfers use                           |
| `substitute.ts`   | `:s`, after `do_sub()`                                                               |
| `vimRegex.ts`     | vim's regex dialect (`\(`, `\<`, `\{n\}`) translated to JavaScript                   |
| `sort.ts`         | `:sort`, stable like `ex_sort()`                                                     |
| `search.ts`       | `/ ? n N * #` with offsets and wrapscan                                              |
| `prompt.ts`       | Typing on the `:` and `/` line: history, `<C-r>`, `<C-v>`                            |
| `operators.ts`    | Operators and motions where the core differs (`d`, `>>`, `J`, `w` under an operator) |
| `textObjects.ts`  | Text objects and `{ }`: brackets, quotes, tags, paragraphs                           |
| `increment.ts`    | `<C-a>` and `<C-x>`, including visual and `g<C-a>`                                   |
| `blockInsert.ts`  | Visual-block `I A c C D X Y`                                                         |
| `lines.ts`        | Shared line helpers: `J`'s join, first non-blank, tab columns                        |
| `macro.ts`        | `q` and `@`, and stopping a macro when a command fails                               |
| `history.ts`      | Undo steps and where `u` puts the cursor                                             |
| `insertKeys.ts`   | Insert-mode keys: arrows, `<BS>`, the `".` register                                  |
| `insertStart.ts`  | Where an insert began, so `<C-w>` and `<C-u>` stop there                             |
| `insertRepeat.ts` | `.` and counts repeat an insert as the keys typed                                    |
| `track.ts`        | Line positions followed through edits                                                |
| `registry.ts`     | Finds the session from the core's editor instance                                    |

What still differs from vim is listed by reason in `oracle/known.ts`.
