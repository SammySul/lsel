# Yank Wars — Step 1 implementation spec (solo, client-only)

Binding context: `CLAUDE.md` (invariants, traps), `docs/decisions.md` (round rules, build order). This spec supersedes the three proposals; implementers will not see them. File:line citations refer to `spikes/headless-replay/node_modules/@replit/codemirror-vim/dist/index.js` (A), `@replit/codemirror-vim-core/vim.js` (C), `@codemirror/commands/dist/index.js` (H), `@codemirror/state/dist/index.js` (S), `@codemirror/view/dist/index.js` (V). Read them when a step says "port"; they are pinned versions (adapter 6.4.0, core 0.1.0).

## 0. Status and open points (2026-11-11)

Implemented and integrated: `bun install --frozen-lockfile`, `bun run check`,
`bun test` and `bun run build` pass from the root. The sections below were
corrected after implementation wherever the code had to differ (each such
place says so), and again after the review pass that replaced the core's macro
recording, closed the clipboard's ex-command paths and fixed several vim
divergences (3.6, 3.11, 8). Left: the manual checklist in `apps/web/README.md` in the
listed browsers, then commit (subject line only).

Defaults taken from the synthesizer's open questions unless Sammy objects:
dead keys/IME unsupported (ASCII puzzles, status hint); `o`/`O` plain newline;
undo one step per command inside macros; 4-min cap applies to solo with
one-key retry; TypeScript 5.9.3; `<C-w>` hint only; Vite `server.fs.allow`
for the workspace root, fallback copy into `apps/web/public/puzzles/`.

Reset chord stays `<C-CR>` (Sammy, 2026-10-31; `<C-S-R>` was considered and
rejected).

Sammy wants weekly usage checked before each large workflow launch and work
stopped at 25%; `~/.claude/scripts/usage.sh` prints it (needs a Bash allow
rule or `!`).

---

## 1. Architecture overview

**One function, both sides.** The only path by which a key ever reaches codemirror-vim is `feedKey(session, key)` in `packages/engine`. The browser calls it from a key-capture extension; the dev self-check and (step 2) the server call it from `replay()`. Both construct the `EditorView` with the same `engineExtensions(puzzle, clock)`, patch the same adapter instance methods in `createSession`, and reset the process-global vim state the same way. Parity is therefore by construction, not by emulation. The browser is "one more replayer whose key source happens to be live".

**What the adapter does on its own in a browser, and how each is bypassed or shared:**

| Adapter behaviour (browser only) | Our treatment |
|---|---|
| `keydown` handler → `handleKey` → `Vim.multiSelectHandleKey` (A:1546-1558, 1460-1507) | A `Prec.highest` keydown handler (engine-owned, `browserInput.ts`) returns `true` for **every** keydown, so CM6 calls `preventDefault()` and stops the chain (V:4615-4628); the adapter's handler never runs. `feedKey` is a DOM-free port of A:1485-1498. |
| Insert-mode text typed natively into the contenteditable, read back by the DOM observer, labelled `input.type` | Never happens: keydown is prevented before any DOM edit; `Prec.highest(EditorView.inputHandler.of(() => true))` and `beforeinput: () => true` swallow anything that still arrives (IME, dictation, autocorrect). `feedKey` inserts via `cm.replaceSelection` on both sides, the same call the core's own `.` replay uses (C:7050). |
| `:` `/` `?` prompt as a real `<input>` in a panel (A:868-924), keys as DOM events outside `contentDOM` | `cm.openDialog` is overridden per instance with an engine-owned virtual prompt (both sides). Prompt keys are ordinary log entries routed through the core's own `onKeyDown`/`onKeyUp`/`callback` with a synthetic event shaped like the core's own virtual prompt (C:1101-1119). |
| Undo grouping by wall clock (`newGroupDelay` 500, `Transaction.time = Date.now()`, H:499-513) | A `transactionFilter` replaces `Transaction.time` with a logical **undo group id** owned by the session, relabels every change's `userEvent` to `input.type`, and marks selection-only transactions `addToHistory: false`; `history({newGroupDelay: 1, joinToEvent: () => true})`. Grouping is a pure function of the key log. |
| `j`/`k` via `cm.findPosV` → `moveVertically` (pixels); `H/M/L/<C-f>/<C-b>/<C-d>/<C-u>/gj/gk/<C-e>/<C-y>/zz/zt/zb` via scroll geometry | `findPosV` patched per instance to line arithmetic (both sides); the window-dependent motions redefined via `Vim.defineMotion`/`Vim.defineAction` on a fixed virtual 30-line window (both sides). |
| `"+`/`"*` registers → `navigator.clipboard` (C:1515, 3251), reachable from `"+`, `:pu +`, `:y +`, `:g/x/pu +` | Both call sites are closed: `RegisterController.prototype.pushText` maps `+`/`*` to no register and the `paste` action is replaced by its non-clipboard branch (`continuePaste`). The clipboard is never read or written. |
| `o`/`O` → `insertNewlineAndIndent` (A:771, C:3244, 3468) | `CodeMirror.commands.newlineAndIndent = cm => cm.replaceSelection("\n")` (vim's `noautoindent` default). `=`, `>>`, `<<` still use the puzzle's language/`indentUnit`/`tabSize`, so those stay engine config. |
| `<BS>`/`<Del>` in insert mode recorded for `.`/macros only via a DOM `keydown` listener (C:3121, 6944-6957) | `feedKey` records `Vim.InsertModeKey` explicitly on both sides before dispatching the deletion. |
| `<C-c>` copy branch, status-bar click `<Esc>`, mouse selection, paste listener (A:1480, 1369; C:320-348) | Unreachable (handler bypassed; `vim({status:true})` never used; mousedown/paste/drop/cut/dragstart/contextmenu blocked; the core's `paste` listener removed from `contentDOM`). |

**Key notation.** One grammar everywhere: a log entry is one code point other than `<`, or `<Name>` / `<C-x>` / `<A-x>` / `<S-Name>` / `<C-S-Name>`. A literal `<` is always `<lt>`; `toCoreKey()` maps it back at the engine boundary. `<Reset>` is a log marker, never a key. `keyFromEvent` is a pure whitelist function aligned with `Vim.vimKeyFromEvent` (C:1219-1257) minus its `>128 → e.code` heuristic and langmap, with explicit Shift/AltGr/Option/Meta policy.

**Lock-in** is decided after each fed key inside `feedKey` (`doc.toString() === puzzle.target`), never in an `updateListener` (which also fires for the intermediate dispatches inside one vim operation, e.g. `:g/x/d`).

**Reset** destroys the session and creates a new one; `createSession` always calls `Vim.resetVimGlobalState_()` + `applyEngineOptions()`, so a client run and the server's tail replay start from the same pristine engine.

**Why this is parity-safe against the listed hazards:** (1) insert text: same `cm.replaceSelection`, same labels, no native path; (2) command line: no `<input>` exists, same virtual prompt, same core handlers; (3) repeat = one key per keydown on both sides, Dead/Process/modifier-only/F-keys/Meta never enter the log, Shift-letters are `e.key` ("A"), `<Space>/<CR>/<BS>/<Tab>/<lt>` share one literal table, `<C-v>` in insert mode is a counted no-op; (4) undo depends only on the group id sequence; (5) all vertical motions are arithmetic.

**Honest costs:** IME, dead keys, dictation, soft keyboards are unsupported (desktop game; HUD hint). Chrome's reserved `Ctrl+W/T/N` cannot be prevented (`<C-w>` in insert mode closes the tab on Windows/Linux Chrome; hint shown). `feedKey` ports ~120 lines of adapter behaviour and uses typed-but-internal API (`vim.status`, `Vim.maybeInitVimState_`, `cm.overWriteSelection`, `cm.findPosV`, `macroModeState.lastInsertModeChanges`, `Vim.InsertModeKey`, `CodeMirror.commands`, `CodeMirror.Pos`); the catalog pins versions and the parity suite is the upgrade gate.

---

## 2. Workspace

### 2.1 File tree

```
yank-wars/
  package.json                      root workspace + catalog + scripts
  bunfig.toml                       [run] bun=true; [test] preload (read from cwd only: run from root)
  bun.lock                          single lockfile (lockfileVersion 2)
  tsconfig.base.json
  biome.json
  .gitignore                        (existing; see 2.10)
  .github/workflows/ci.yml
  test/dom.ts                       happy-dom globals for bun test
  flake.nix, nix/                   unchanged in step 1
  CLAUDE.md, docs/decisions.md      updated (see 8)
  puzzles/
    README.md                       authoring rules (section 5)
    handmade/<id>.json              10 puzzles
  packages/engine/
    package.json
    tsconfig.json
    src/index.ts                    public barrel
    src/keys.ts                     VimKey, NAMED_KEYS, parseKeys/formatKeys/isVimKey, toCoreKey, keyToDomKey
    src/keyFromEvent.ts             KeyboardEvent-like -> VimKey | undefined, detectPlatform
    src/log.ts                      RESET, LogEntry, currentRun/runs/scoreOf
    src/puzzle.ts                   Puzzle, PuzzleSchema (valibot), parsePuzzle, PUZZLE_LIMITS
    src/languages.ts                LanguageId -> Language.extension
    src/round.ts                    RoundState reducer with injected clock
    src/vimSetup.ts                 lockEngine, applyEngineOptions, VIRTUAL_WINDOW_LINES
    src/registry.ts                 adapter instance -> session + dispatch, for core actions and ex commands
    src/macro.ts                    macro recording/playback as keys, :normal, MAX_MACRO_DEPTH
    src/insertStart.ts              vim's insert start, for insert-mode <C-w>/<C-u>
    src/history.ts                  UndoClock, undoHistory (history config + transactionFilter)
    src/insertKeys.ts               INSERT_LITERALS, insertCommands, insertKeymap, recordInsertKey
    src/prompt.ts                   PromptState, installPrompt, routePromptKey
    src/session.ts                  EditorSession, engineExtensions, createSession, destroySession
    src/feedKey.ts                  feedKey
    src/snapshot.ts                 HudState, sessionSnapshot
    src/browserInput.ts             Prec.highest key capture + blockers (engine-owned, browser-only)
    src/replay.ts                   replay, verifyRun
    src/*.test.ts                   see section 6
  apps/web/
    package.json
    tsconfig.json
    vite.config.ts
    svelte.config.js
    index.html
    src/main.ts
    src/app.css
    src/App.svelte
    src/lib/puzzles.ts              import.meta.glob of puzzles/handmade/*.json -> parsePuzzle
    src/lib/prefs.svelte.ts         relativeNumbers + per-puzzle best, reactive wrapper
    src/lib/prefsStorage.ts         localStorage read/merge/write (try/catch; re-read before every write)
    src/lib/clock.ts                now(): number via performance.now()
    src/lib/chords.ts               RESET_KEY, FORFEIT_KEY, NUMBERS_KEY, READY_KEYS
    src/lib/round.svelte.ts         RoundController (runes)
    src/dev/selfCheck.ts            dev-only replay of the final run
    src/editor/playerView.ts        createPlayerView
    src/editor/targetView.ts        createTargetView
    src/editor/diff.ts              Chunk.build -> line decorations (player + target sides)
    src/editor/gutter.ts            relativeGutter/absoluteGutter + Compartment
    src/editor/theme.ts             dark theme, fat cursor, diff colours, highlight style
    src/editor/diff.test.ts, gutter.test.ts
    src/components/PuzzleList.svelte
    src/components/Round.svelte
    src/components/Hud.svelte
    src/components/Panes.svelte
    src/components/StatusLine.svelte
    src/components/StudyOverlay.svelte
    src/components/ResultCard.svelte
    src/components/FocusHint.svelte
  spikes/                           untouched, excluded from biome, never imported
```

### 2.2 Root `package.json`

```json
{
  "name": "yank-wars",
  "private": true,
  "type": "module",
  "workspaces": {
    "packages": ["packages/*", "apps/*"],
    "catalog": {
      "@codemirror/commands": "6.11.1",
      "@codemirror/language": "6.13.1",
      "@codemirror/search": "6.7.2",
      "@codemirror/state": "6.7.6",
      "@codemirror/view": "6.43.15",
      "@replit/codemirror-vim": "6.4.0",
      "typescript": "5.9.3"
    }
  },
  "scripts": {
    "dev": "bun run --filter @yank-wars/web dev",
    "build": "bun run --filter @yank-wars/web build",
    "check": "tsc --noEmit -p packages/engine && bun run --filter @yank-wars/web check && biome check . && grep -q '\"preset\": \"recommended\"' biome.json",
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "1.4.4",
    "happy-dom": "21.0.4",
    "typescript": "catalog:"
  }
}
```

Notes: Bun's isolated linker is the default for workspaces; root scripts cannot call member bins (hence `--filter`). The `grep` guards against `biome migrate` rewriting the preset to `none`. The root `postinstall: bun2nix -o bun.nix` arrives in step 2 with the first `package.nix` (one `bun.nix` at the root).

### 2.3 `bunfig.toml` (root)

```toml
[run]
bun = true

[test]
preload = ["./test/dom.ts"]
```

### 2.4 `test/dom.ts`

```ts
import { Window } from "happy-dom";

const w = new Window();
const g = globalThis as unknown as Record<string, unknown>;
const src = w as unknown as Record<string, unknown>;
for (const k of [
  "Window", "Element", "Range", "Text", "DocumentFragment", "ResizeObserver",
  "IntersectionObserver", "document", "navigator", "MutationObserver",
  "requestAnimationFrame", "getComputedStyle", "Node", "HTMLElement", "KeyboardEvent",
]) g[k] ??= src[k];
g.window = w;
```

No clipboard shim: no engine path reaches `navigator.clipboard` (3.6), so a regression throws in tests instead of being masked.

Step 2's server must install the same globals before its first `EditorView`.

### 2.5 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "useDefineForClassFields": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

### 2.6 `packages/engine/package.json` and `tsconfig.json`

```json
{
  "name": "@yank-wars/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@codemirror/commands": "catalog:",
    "@codemirror/language": "catalog:",
    "@codemirror/search": "catalog:",
    "@codemirror/state": "catalog:",
    "@codemirror/view": "catalog:",
    "@replit/codemirror-vim": "catalog:",
    "@codemirror/lang-css": "6.3.1",
    "@codemirror/lang-go": "6.0.1",
    "@codemirror/lang-javascript": "6.2.5",
    "@codemirror/lang-json": "6.0.2",
    "@codemirror/lang-python": "6.2.1",
    "@codemirror/lang-rust": "6.0.2",
    "valibot": "1.5.0"
  }
}
```

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["bun"] }, "include": ["src"] }
```

### 2.7 `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `index.html`, `src/main.ts`

```json
{
  "name": "@yank-wars/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --bun vite",
    "build": "bun --bun vite build",
    "preview": "bun --bun vite preview",
    "check": "bun --bun svelte-check --tsconfig ./tsconfig.json --output human"
  },
  "dependencies": {
    "@codemirror/language": "catalog:",
    "@codemirror/merge": "6.12.3",
    "@codemirror/state": "catalog:",
    "@codemirror/theme-one-dark": "6.1.3",
    "@codemirror/view": "catalog:",
    "@yank-wars/engine": "workspace:*",
    "svelte": "5.57.3"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "7.3.1",
    "svelte-check": "4.7.7",
    "typescript": "catalog:",
    "vite": "8.3.5"
  }
}
```

The web deliberately does **not** declare `@codemirror/commands`, any `@codemirror/lang-*` or `@replit/codemirror-vim`; under the isolated linker an import of them from `apps/web` fails to resolve, which enforces "the web adds only visuals".

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["vite/client", "bun"] },
  "include": ["src/**/*.ts", "src/**/*.svelte", "vite.config.ts"]
}
```

```ts
// apps/web/vite.config.ts
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, searchForWorkspaceRoot } from "vite";

export default defineConfig({
  plugins: [svelte()],
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd())] } },
});
```

```js
// apps/web/svelte.config.js
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
export default { preprocess: vitePreprocess() };
```

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Yank Wars</title>
    <link rel="icon" href="data:," />
    <style>html,body{margin:0;background:#0d1117;color:#e6edf3}</style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```ts
// apps/web/src/main.ts
import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
const target = document.getElementById("app");
if (target === null) throw new Error("index.html has no #app element");
mount(App, { target });
```

### 2.8 `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!!spikes"] },
  "formatter": { "enabled": true, "indentStyle": "space", "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "preset": "recommended" } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "overrides": [
    {
      "includes": ["**/*.svelte"],
      "linter": {
        "rules": {
          "style": { "useConst": "off", "useImportType": "off" },
          "correctness": { "noUnusedVariables": "off", "noUnusedImports": "off" }
        }
      }
    }
  ]
}
```

Legacy Svelte mode (script only). Never run `biome migrate` (it rewrites `preset` to `none`); the `check` script greps for it.

### 2.9 `.github/workflows/ci.yml`

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: DeterminateSystems/nix-installer-action@v16
      - run: nix develop -c bun install --frozen-lockfile
      - run: nix develop -c bun run check
      - run: nix develop -c bun test
      - run: nix develop -c bun run build
```

### 2.10 `.gitignore` additions

Existing entries (`node_modules/`, `dist/`, `result`) suffice. Add `*.local` (Vite env files) and `.DS_Store`.

### 2.11 Versions (exact)

Engine: `@codemirror/state 6.7.6`, `view 6.43.15`, `commands 6.11.1`, `language 6.13.1`, `search 6.7.2`, `@replit/codemirror-vim 6.4.0` (pulls `@replit/codemirror-vim-core 0.1.0`), `lang-javascript 6.2.5`, `lang-python 6.2.1`, `lang-go 6.0.1`, `lang-rust 6.0.2`, `lang-json 6.0.2`, `lang-css 6.3.1`, `valibot 1.5.0`. Web: `svelte 5.57.3`, `vite 8.3.5`, `@sveltejs/vite-plugin-svelte 7.3.1`, `svelte-check 4.7.7`, `@codemirror/merge 6.12.3`, `@codemirror/theme-one-dark 6.1.3`. Root: `typescript 5.9.3` (svelte-check 4.7.7 hard-fails on TS 7; 6.0.3 is a verified alternative), `@types/bun 1.4.4`, `happy-dom 21.0.4`. Toolchain from the Nix shell: bun 1.4.2, biome 2.5.15. Add dependencies only via `bun add -E <pkg>@<ver> --filter <workspace>` from the root; catalog entries by editing the root `catalog` and writing `"catalog:"`.

---

## 3. `packages/engine`

All modules are pure TS; CodeMirror touches the DOM only when an `EditorView` is created, so the package imports fine without globals. `index.ts` re-exports every public symbol below plus type-only re-exports of `EditorView`, `Extension`, `Text` for consumers that must not import `@codemirror/*` themselves. Where `@replit/codemirror-vim`'s `index.d.ts` lacks a member we use (`overWriteSelection`, `vimPlugin.blockCursor`, `lastInsertModeChanges`, `plugin.query`), declare a narrow local interface and cast once in `session.ts`; never `any`.

### 3.1 `keys.ts`

```ts
export type VimKey = string & { readonly __brand: "VimKey" };
export class KeyNotationError extends Error { constructor(message: string, readonly index: number) }
export const NAMED_KEYS: ReadonlySet<string>;
// "Esc","CR","BS","Del","Tab","Space","Ins","Left","Right","Up","Down","Home","End","PageUp","PageDown","lt"
export function isVimKey(s: string): s is VimKey;
export function parseKeys(notation: string): VimKey[];
export function formatKeys(keys: readonly (VimKey | "<Reset>")[]): string;
export function toCoreKey(k: VimKey): string;
export interface SyntheticKeyInit { key: string; keyCode: number; ctrlKey: boolean; altKey: boolean; metaKey: false; shiftKey: boolean }
export function keyToDomKey(key: VimKey): SyntheticKeyInit;
```

Grammar accepted by `isVimKey` (canonical spellings only, so every key has exactly one spelling): exactly one Unicode code point that is not `<`, a space or a control/surrogate code point (a bare `>` is a key: `>>`, `V>`); or `<` + optional `C-` + optional `A-` + optional `S-` + (single such code point other than `<`/`>` | name in `NAMED_KEYS`, exact case) + `>`; a bracketed single character needs `C-` or `A-` (`<x>` is written `x`; `<S-a>` is invalid, `<C-S-A>` valid); `<lt>` only without modifiers; `M-` rejected; `<Reset>` rejected.

`parseKeys`: tokenize with `/<[^<>]+>|[\s\S]/gu`; a bare `<` throws `KeyNotationError` ("write <lt>"), whose `index` is the UTF-16 offset of the bad token. `" "` becomes `<Space>`; a bare tab, newline or other control character throws (write `<Tab>`, `<CR>`). Inside `<...>` normalise case: modifier letters upper-cased, names canonicalised (`<cr>` → `<CR>`, `<esc>` → `<Esc>`, `<space>` → `<Space>`, `<lt>` stays), the character after modifiers preserved verbatim. Unknown names, `<x>`, `<C->`, `<>`, `<C-lt>` and `<Reset>` throw. Every result satisfies `isVimKey`.

`formatKeys`: concatenation (identity, since `<` never appears bare in a log). `toCoreKey`: `<lt>` → `<`, everything else unchanged. `keyToDomKey`: `<CR>` → `{key:"Enter", keyCode:13}`, `<Esc>` → `Escape`/27, `<BS>` → `Backspace`/8, `<Del>` → `Delete`/46, `<Tab>` → `Tab`/9, `<Space>` → `" "`/32, `<Ins>` → `Insert`/45, `<Left>` → `ArrowLeft`/37, `<Up>` 38, `<Right>` 39, `<Down>` 40, `<Home>` 36, `<End>` 35, `<PageUp>` 33, `<PageDown>` 34, `<lt>` → `"<"`/0, single char → itself/0; `C-`/`A-`/`S-` set the booleans; `metaKey` always false.

### 3.2 `keyFromEvent.ts`

```ts
export type Platform = "mac" | "other";
export interface KeyEventLike { key: string; code: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean; isComposing: boolean }
export function keyFromEvent(e: KeyEventLike, platform: Platform): VimKey | undefined;
export function detectPlatform(nav: { platform: string } | undefined): Platform; // /Mac|iPhone|iPad/ -> "mac"
```

Exact rules, in order:

1. `e.isComposing` → `undefined`. `e.metaKey` → `undefined`.
2. `e.key` ∈ {`Shift`,`Control`,`Alt`,`AltGraph`,`Meta`,`OS`,`CapsLock`,`NumLock`,`ScrollLock`,`ContextMenu`,`Dead`,`Unidentified`,`Process`,`Fn`,`FnLock`,`Hyper`,`Super`,`Symbol`,`SymbolLock`} or matches `/^F\d{1,2}$/` → `undefined`.
3. Named table: `Enter`→`CR`, `Backspace`→`BS`, `Delete`→`Del`, `Escape`→`Esc`, `Insert`→`Ins`, `Tab`→`Tab`, `ArrowLeft`→`Left`, `ArrowRight`→`Right`, `ArrowUp`→`Up`, `ArrowDown`→`Down`, `Home`, `End`, `PageUp`, `PageDown`, `" "`→`Space`. Any other `e.key` with more than one code point → `undefined`. Otherwise `printable = true` and `key = e.key` (astral chars allowed).
4. Modifiers: `ctrl = e.ctrlKey`, `alt = e.altKey`. If `printable && ctrl && alt` → AltGr: `ctrl = alt = false` (DE/FR/ES/PL `{ } [ ] @ \` must be typeable). If `printable && alt && !ctrl && platform === "mac"` → `alt = false` (Option produces the character, as the core does at C:1233-1235). `prefix = (ctrl ? "C-" : "") + (alt ? "A-" : "")`. Shift: if `(prefix !== "" || !printable) && e.shiftKey` → `prefix += "S-"`, **except** Shift alone (no `C-`/`A-`) on `Space`, `CR`, `BS`, `Tab`, `Del`, `Esc`, `Ins` → no `S-` (Shift+Space is a space, Shift+Enter a newline, like terminal vim; `<S-Left>` and friends survive).
5. Result: `printable && prefix === ""` → `key === "<" ? "<lt>" : key`; else `` `<${prefix}${key}>` ``. A modified `<` or `>` (`<C-<>`, `<A->>`, …) and any result that fails `isVimKey` (a control character) → `undefined`, so the log never holds a key the server's `parseKeys` would reject.
6. `e.repeat` is ignored: every keydown is one key (VimGolf convention).

Agreement property (tested): for all printable ASCII × {none, ctrl, ctrl+shift} and all named keys × {none, shift, ctrl} on platform `other`, `keyFromEvent(e)` equals `Vim.vimKeyFromEvent(e)` (no `vim` argument), except the documented normalisations: `<` → `<lt>`, Shift+{Space,Enter,Backspace,Tab,Delete,Escape,Insert} → base key, a modified `<`/`>` → undefined, Meta → undefined, F-keys → undefined, Process → undefined.

### 3.3 `log.ts`

```ts
export const RESET = "<Reset>" as const; export type ResetMarker = typeof RESET;
export type LogEntry = VimKey | ResetMarker; export type KeyLog = readonly LogEntry[];
export function isReset(e: LogEntry): e is ResetMarker;
export function runs(log: KeyLog): VimKey[][];        // split on RESET; at least one run; the last may be empty
export function currentRun(log: KeyLog): VimKey[];    // entries after the last RESET (= runs(log).at(-1))
export function scoreOf(log: KeyLog): number;         // currentRun(log).length
```

`RESET` can never be produced by `keyFromEvent` (`Reset` is not a named key) and is rejected by `parseKeys`.

### 3.4 `puzzle.ts`

```ts
export type LanguageId = "text" | "javascript" | "typescript" | "jsx" | "tsx" | "python" | "go" | "rust" | "json" | "css";
export type PuzzleSource =
  | { kind: "original"; author: string }
  | { kind: "excerpt"; repo: string; url: string; license: "MIT" | "Apache-2.0" | "BSD-2-Clause" | "BSD-3-Clause" | "ISC"; path: string; commit: string };
export interface Puzzle {
  id: string; title: string; description?: string; language: LanguageId;
  tabSize: number; indentUnit: string; start: string; target: string;
  solution: VimKey[]; par: number; source: PuzzleSource; tags?: string[];
}
export interface PuzzleJson { /* section 5.1 */ }
export const PuzzleJsonSchema: v.GenericSchema<unknown, PuzzleJson>;  // valibot; `solution` is a notation string in JSON
export class PuzzleError extends Error { constructor(readonly issues: readonly string[]) }  // message = issues joined by "\n"
export function parsePuzzle(json: unknown, expectedId?: string): Puzzle;  // validates, parseKeys(solution), par = solution.length
export const PUZZLE_LIMITS = { maxLines: 30, maxLineLength: 120, maxChars: 3000 } as const;
```

Validation rules are in section 5. `parsePuzzle` throws `PuzzleError` listing every valibot issue as `path: message`; when `expectedId` is given and differs from `id`, it throws too. The schema is strict beyond 5.1: unknown keys (a stored `par`, a typo) are rejected, author/repo/path/tag strings must be non-empty, an excerpt's `commit` is a full 40-char hex SHA and its `url` must contain it.

### 3.5 `languages.ts`

```ts
export function languageExtension(id: LanguageId): Extension;
```

Returns `javascriptLanguage.extension`, `typescriptLanguage.extension`, `jsxLanguage.extension`, `tsxLanguage.extension`, `pythonLanguage.extension`, `goLanguage.extension`, `rustLanguage.extension`, `jsonLanguage.extension`, `cssLanguage.extension`, or `[]` for `"text"`. Never `LanguageSupport.support` (html/jsx `autoCloseTags` and the markdown keymap type characters). The language is engine config because `=` (`indentSelection`), `>>`/`<<` (`indentMore/Less`) read the syntax tree, `indentUnit` and `tabSize`.

### 3.6 `vimSetup.ts`

```ts
export const VIRTUAL_WINDOW_LINES = 30;
export function lockEngine(): void;            // idempotent (module flag), once per process
export function applyEngineOptions(): void;    // after every Vim.resetVimGlobalState_()
```

`lockEngine()`:

1. `Vim.defineEx(name, shortName, blocked)` for each of: `colorscheme/colo`, `map/map`, `imap/im`, `nmap/nm`, `vmap/vm`, `omap/om`, `noremap/no`, `nnoremap/nn`, `vnoremap/vn`, `inoremap/ino`, `onoremap/ono`, `unmap/unmap`, `mapclear/mapc`, `nmapclear/nmapc`, `vmapclear/vmapc`, `imapclear/imapc`, `omapclear/omapc`, `set/se`, `setlocal/setl`, `setglobal/setg`, `write/w` (exact built-in names and shortNames from C:272-309, so `defineEx` replaces the `commandMap_` entry, C:887-895). `blocked(cm)` calls `cm.openNotification(div("mappings and :set are disabled in Yank Wars"), {bottom: true, duration: 5000})`; for `write`: "lock-in is automatic".
2. `Vim.mapclear()`; `Vim.suppressErrorLogging = true`.
3. `CodeMirror.commands.newlineAndIndent = (cm) => cm.replaceSelection("\n")` (core calls `CM.commands.newlineAndIndentContinueComment || CM.commands.newlineAndIndent` at C:3244 and 3468; the former is `undefined` in the adapter).
4. The clipboard's two call sites are closed, so `"+`/`"*` are the unnamed register from every entry point (`"+p`, `:pu +`, `:y +`, `:g/x/pu +`): `RegisterController.prototype.pushText` is wrapped to map `+`/`*` to no register (C:1515), and `Vim.defineAction("paste")` runs the core's non-clipboard branch, `this.continuePaste(cm, args, vim, register.toString(), register)` with `+`/`*` mapped to the unnamed register (C:3251-3260). (Implemented first as a `setRegister` override, which missed the ex commands.)
5. `Vim.defineAction("scroll", () => {})` and `Vim.defineAction("scrollToCursor", () => {})` (`<C-e>`, `<C-y>`, `zz`, `zt`, `zb`, `z.`, `z<CR>`, `z-` never move the cursor; vim's `<C-e>` only moves it when it would scroll off, which cannot happen when the whole puzzle is visible).
6. `Vim.defineMotion` overrides (`Pos = CodeMirror.Pos`, `last = cm.lastLine()`, `fnb(l) = index of first non-whitespace char on line l`, `clamp(l) = Math.max(0, Math.min(last, l))`):
   - `moveToTopLine(cm, _head, args)`: `l = clamp(args.repeat - 1)`; `new Pos(l, fnb(l))`.
   - `moveToMiddleLine(cm)`: `l = Math.floor(Math.min(last, VIRTUAL_WINDOW_LINES - 1) / 2)`; `new Pos(l, fnb(l))`.
   - `moveToBottomLine(cm, _head, args)`: `l = clamp(Math.min(last, VIRTUAL_WINDOW_LINES - 1) - args.repeat + 1)`; `new Pos(l, fnb(l))`.
   - `moveByPage(cm, head, args)`: `n = (VIRTUAL_WINDOW_LINES - 2) * args.repeat`; `l = clamp(head.line + (args.forward ? n : -n))`; `new Pos(l, fnb(l))`.
   - `moveByScroll(cm, head, args, vim)`: `args.repeat = args.repeat || Math.floor(VIRTUAL_WINDOW_LINES / 2)` (no count arrives as `0`, C:2028-2042); `return this.moveByLines(cm, head, args, vim)` (motions are invoked with `this === motions`, C:2043, so column persistence via `vim.lastHPos` keeps working).
   - `moveByDisplayLines(cm, head, args, vim)`: `return this.moveByLines(cm, head, args, vim)` (`gj`/`gk` = `j`/`k`).
   - `moveByLines`: a port of C:2398-2441 without the pixel goal, returning `null` (the motion fails, so an operator does nothing) when the cursor is already on the first line moving up or the last line moving down; the core jumps to the line's start/end there, so `dj` on the last line deleted it. Added in review.
7. Added in review, each matching vim (`vim -u NONE`):
   - `g0` → `moveToStartOfLine`, `g^` → `moveToFirstNonWhiteSpaceCharacter` via `Vim.mapCommand` (the core runs CM6's smart home for both, C:140, 2575).
   - `r<character>` → action `countedReplace`: fails when the count runs past the end of the line (`5rx` on `abc`), else `this.replace(...)`.
   - `c` → operator `changeNoIndent` and normal `S` → `{operatorMotion changeNoIndent, expandToLine}` (the core's `S` is a noremap keyToKey that skips mapped commands): after `this.change(...)`, a linewise non-visual change also deletes the indent the core keeps (C:2732), vim's `noautoindent`; the register still holds the whole line.
   - Insert `<C-w>`/`<C-u>` → actions that delete back to the word/line start but stop once at the insert start (`insertStart.ts`, vim's `Insstart_orig` with its arrow-key rules) and join lines at column 0 (`'backspace'` `indent,eol,start`).
   - Macros (`q`, `@`) and `:normal` are the engine's (`macro.ts`), because the core records insert sessions as change lists, never records ex commands, and leaves a played `:` prompt open (C:6768-6801): `enterMacroRecordMode` starts an engine recording, `feedKey` appends every typed key until a `q` in normal mode with nothing pending, and the keys are stored in the register one per `keyBuffer` entry (`qQ` appends). `replayMacro` feeds the register's keys (tokenised like C:6785) through the same per-key path as typed keys, `@:` runs the last ex command, and nesting deeper than `MAX_MACRO_DEPTH` (100) throws, so a recursive macro stops at the same key on every engine instead of wherever the stack runs out. `:normal` types its argument literally (`<CR>` is four keys) through the same path and aborts an unfinished command with `<Esc>`.

`applyEngineOptions()`: `Vim.setOption("pcre", false)` so `/` and `:s` use vim regex syntax (`\(`, `\+`, `\<`); `resetVimGlobalState_` restores option defaults (C:776-779), hence it must run after every reset. `:set` is blocked so players cannot flip it.

### 3.7 `history.ts`

```ts
export interface UndoClock { group: number }   // starts at 0; feedKey increments
export function undoHistory(clock: UndoClock): Extension;
```

Returns `[history({ newGroupDelay: 1, joinToEvent: () => true }), EditorState.transactionFilter.of(policy)]` where:

```ts
policy(tr) {
  if (tr.changes.empty) {
    if (!tr.selection) return tr;                            // effects-only (reconfigure, forceParsing, search decorations): untouched
    return { selection: tr.selection, effects: tr.effects, scrollIntoView: tr.scrollIntoView,
             annotations: [...tr.annotations, Transaction.addToHistory.of(false)] };
  }
  const keep = tr.annotations.filter(a => a.type !== Transaction.time && a.type !== Transaction.userEvent);
  return { changes: tr.changes, selection: tr.selection, effects: tr.effects, scrollIntoView: tr.scrollIntoView,
           annotations: [...keep, Transaction.time.of(clock.group), Transaction.userEvent.of("input.type")] };
}
```

Why it works (verified in sources): a spec returned by a filter is resolved with `filter: false` and never re-filtered (S:2455-2462); `Transaction.create` only stamps `Date.now()` when no `time` annotation exists (S:2246-2247); history joins a change into the previous event iff `joinableUserEvent.test(userEvent)` and `!lastEvent.selectionsAfter.length && time - prevTime < newGroupDelay && joinToEvent(...)` (H:499-507). With `time = group`, `newGroupDelay = 1`, `joinToEvent = true` and no selection events ever recorded, a change joins iff its group equals the previous change's group. Undo/redo transactions carry `filter: false` and are untouched; `isolateHistory` and other annotations are preserved. Relabelling to plain `input.type` (not `.compose`, which always joins, H:507) is essential; it also makes `indentMore`'s `input.indent` joinable. Comment in the file: "Transaction.time here is a logical undo-group id, not a clock."

Group assignment is in `dispatchKey` (3.11): the group increments for every key, typed or replayed by a macro, that arrives in normal/visual mode with no prompt open and outside an ex command, and when an insert-mode cursor key moves the cursor (`<Home>`/`<End>` always; vim's `:help ins-special-special`). (Before review a `vim-command-done` listener did this for the core's macro playback.) Resulting rule: one undo step per normal-mode command including the insert session it opens (`cwfoo<Esc>`, `ohey<Esc>`, `3ix<Esc>`, visual-block `I`), one per ex command (`:s`, `:g`, `:g/x/norm @q`), one per command inside `@q` (vim-like), `.` is one step, `x` then `ihello<Esc>` are two steps.

### 3.8 `insertKeys.ts`

```ts
export const INSERT_LITERALS: Readonly<Record<string, string>> = { "<Space>": " ", "<Tab>": "\t", "<CR>": "\n", "<lt>": "<" };
export function literalOf(key: VimKey): string | undefined;  // INSERT_LITERALS[key] ?? (single code point ? key : undefined)
export const insertCommands: Readonly<Record<"Backspace" | "Delete" | "Left" | "Right" | "Up" | "Down" | "Home" | "End", Command>>;
export const insertKeymap: Extension;   // keymap.of(Object.entries(insertCommands).map(([key, run]) => ({ key, run })))
export function recordInsertKey(name: "Backspace" | "Delete"): void;
```

`insertCommands`: `Backspace = deleteCharBackwardStrict`, `Delete = deleteCharForward` (from `@codemirror/commands`); `Left`/`Right` move each range by one grapheme (`findClusterBreak`); `Up`/`Down` move to line ±1 keeping the column clamped to that line's length (pure `doc.lineAt` arithmetic, no `moveVertically`); `Home`/`End` to `line.from`/`line.to`. Each command dispatches with `userEvent: "select"` (cursor moves) or the command's own label (deletions); the undo filter relabels anyway. The keymap exists only so the core's `sendCmKey` → `CodeMirror.lookupKey` → `CodeMirror.keys[name]` → `runScopeHandlers(view, {key: name}, "editor")` (A:117-124, 799-805, C:7021-7030) finds the same command when `.`/`@q` replays an `InsertModeKey`; the browser's keydown never reaches it. Key names must be exactly `Backspace`, `Delete`, `ArrowLeft`…: `CodeMirror.keys` is keyed by `Left/Right/Up/Down/Backspace/Delete` and `lookupKey` strips the `Arrow` prefix, so bind both `Left` (w3c name `ArrowLeft`) forms as CM6 keymap names `ArrowLeft`… and the `runScopeHandlers` event `{key: "Left"}` — note CM6's `keyName(event)` returns `event.key` verbatim, so bind **both** `"ArrowLeft"` and `"Left"` (and `Right/Up/Down`) to the same command.

`recordInsertKey(name)` ports C:6944-6957: `const ms = Vim.getVimGlobalState_().macroModeState; if (ms.isPlaying) return; const lc = ms.lastInsertModeChanges; if (lc.maybeReset) { lc.changes = []; lc.maybeReset = false; } lc.changes.push(new Vim.InsertModeKey(name, { key: name, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }));` (`CodeMirror.keyName` is `undefined`, A:811, so the recorded `keyName` is the raw DOM key name).

### 3.9 `prompt.ts`

```ts
export type PromptHandler = (e: SyntheticPromptEvent, value: string, close: (v?: string) => void) => unknown;
export interface SyntheticPromptEvent extends SyntheticKeyInit { target: { value: string; selectionStart: number; selectionEnd: number }; preventDefault(): void; stopPropagation(): void }
export interface PromptState { readonly prefix: string; value: string; readonly callback: ((v: string) => void) | undefined; readonly onKeyDown: PromptHandler | undefined; readonly onKeyUp: PromptHandler | undefined; closed: boolean }
export function installPrompt(s: EditorSession): void;
export function routePromptKey(s: EditorSession, key: VimKey): void;
```

`installPrompt` overrides two instance methods (they are prototype methods, A:127-133):

```ts
s.cm.openDialog = (template, callback, options) => {
  if (!options?.onKeyDown && !options?.onKeyUp) return () => {};        // "recording @q" banner (C:686-690): ignore; HUD reads macroModeState
  s.message = null;
  const p: PromptState = { prefix: template.querySelector("span")?.firstChild?.textContent ?? template.textContent ?? "", value: options.value ?? "", callback, onKeyDown: options.onKeyDown, onKeyUp: options.onKeyUp, closed: false };
  s.prompt = p;
  return (newVal?: string) => {
    if (typeof newVal === "string") { p.value = newVal; return; }
    if (p.closed) return;
    p.closed = true;
    if (s.prompt === p) s.prompt = null;                                 // identity check: the :s///c confirm prompt may already have replaced it
  };
};
s.cm.openNotification = (template, options) => {
  const m = { text: template.textContent ?? "", long: options?.duration === 0 };
  s.message = m;
  return () => { if (s.message === m) s.message = null; };              // showConfirm stores this for `long` and multiSelectHandleKey consumes it (C:5307, 7099-7106)
};
```

`routePromptKey(s, key)` (port of A:899-912 + C:1094-1136):

```
p = s.prompt!; core = toCoreKey(key)
ev = { ...keyToDomKey(key), target: { value: p.value, selectionStart: p.value.length, selectionEnd: p.value.length }, preventDefault(){}, stopPropagation(){} }
close = the function returned by openDialog for p
if (p.onKeyDown?.(ev, p.value, close)) return                      // :s///c confirm swallows every key (C:6632-6659, returns true)
if (p.closed) return                                                // search/ex handlers cancel on <Esc>/<C-c>/<C-[>/<BS>-on-empty and run clearInputState (C:1829-1842, 1927-1934)
switch (key):
  "<CR>":  p.closed = true; if (s.prompt === p) s.prompt = null; s.inExCallback = true; try { p.callback?.(p.value) } finally { s.inExCallback = false }
  "<Esc>": close()                                                  // unreachable for search/ex (handled above); kept for prompts without onKeyDown cancel
  "<BS>":  p.value = p.value.slice(0, -1)                           // non-empty only; empty case cancelled by the core
  "<Up>", "<Down>", "<C-u>": nothing (core already called close(string))
  "<Left>", "<Right>", "<Home>", "<End>", "<Del>", "<Tab>", any other <...> with modifiers: nothing (counted no-op; append-only command line)
  default: lit = literalOf(key); if (lit !== undefined && lit !== "\n" && lit !== "\t") p.value += lit
if (!p.closed) p.onKeyUp?.(ev with target.value = p.value, p.value, close)   // search incremental highlight + history reset (C:1795-1823, 1956-1972)
```

Exceptions escape to `feedKey`'s catch.

### 3.10 `session.ts`

```ts
export interface EditorSession {
  readonly puzzle: Puzzle; readonly view: EditorView; readonly cm: CodeMirror; readonly target: string;
  readonly clock: UndoClock;
  prompt: PromptState | null; message: { text: string; long: boolean } | null;
  inExCallback: boolean; feeding: boolean; keysFed: number; solved: boolean; lastError: string | null;
}
export interface SessionOptions { parent: HTMLElement; extraExtensions?: readonly Extension[] }
export function engineExtensions(puzzle: Puzzle, clock: UndoClock): Extension[];
export function createSession(puzzle: Puzzle, opts: SessionOptions): EditorSession;
export function destroySession(s: EditorSession): void;   // view.destroy()
```

`engineExtensions` (order matters; `vim()` first as its README requires):

```ts
[
  vim(),
  EditorState.allowMultipleSelections.of(true),
  EditorState.tabSize.of(puzzle.tabSize),
  indentUnit.of(puzzle.indentUnit),
  languageExtension(puzzle.language),
  undoHistory(clock),
  insertKeymap,
  EditorView.contentAttributes.of({ autocorrect: "off", autocapitalize: "off", spellcheck: "false" }),
]
```

Never: `basicSetup`, `defaultKeymap`, `historyKeymap`, `indentWithTab`, `closeBrackets`, `autocompletion`, `indentOnInput`, `EditorView.lineWrapping`, folding, `rectangularSelection`, `dropCursor`, `vim({status: true})`, `EditorState.readOnly` (the adapter's `dispatchChange` and `enterInsertMode` refuse under it).

`createSession`:

1. `lockEngine(); Vim.resetVimGlobalState_(); applyEngineOptions();` (every session starts from a pristine engine; the server's tail replay does the same).
2. `clock = { group: 0 }`; `view = new EditorView({ state: EditorState.create({ doc: puzzle.start, extensions: [...engineExtensions(puzzle, clock), ...(opts.extraExtensions ?? [])] }), parent: opts.parent })`; `cm = getCM(view)!`.
3. Patch `cm.findPosV(start, amount, unit, goal)`: for `unit === "line"`: `line = clamp(start.line + amount, 0, doc.lines - 1)`, `ch = min(start.ch, length of that line)`, result `{line, ch, hitSide}` where `hitSide = (line !== start.line + amount)`; for `"page"` same with `amount * VIRTUAL_WINDOW_LINES`; other units delegate to the original. Return a `CodeMirror.Pos` with `hitSide` set as the adapter does (A:522-528).
4. `installPrompt(s)`.
5. `view.contentDOM.removeEventListener("paste", cm.state.vim!.onPasteFn!, false)` (the core registers it before CM6's listeners, C:320-327, so a CM6 handler cannot block it).
6. `bindSession(cm, { session: s, dispatch })` (`registry.ts`), so the engine's macro and `:normal` actions find the session from the adapter instance; `dispatch` detaches `cm.curOp` around `dispatchKey`, because replayed keys arrive inside the `@q`/`:normal` key's vim operation, which defers the change events the `.` and count-insert recorders need (A:636-666). `cm.on("vim-mode-change", …)` feeds `insertStart.ts`.
7. `forceParsing(view, view.state.doc.length, 1e9)`.

### 3.11 `feedKey.ts`

```ts
export interface KeyResult { solved: boolean; docChanged: boolean; error: string | null }
export function feedKey(s: EditorSession, key: VimKey): KeyResult;
```

Algorithm (port of A:1460-1507 without DOM). Since review the per-key part is `dispatchKey(s, key)`, which macro playback and `:normal` call too: it does the group bump (also skipped inside an ex command), stops an engine macro recording on `q`, and captures the insert start after the key; `feedKey` keeps the bookkeeping and appends the key to an active recording. In `insertFallback`, `<Left>/<Right>/<Up>/<Down>/<Home>/<End>` move in replace mode too and split undo as above.

```
if (s.solved) return { solved: true, docChanged: false, error: null }
s.keysFed++; s.lastError = null; s.feeding = true
const before = s.view.state.doc
let vim = s.cm.state.vim!; const core = toCoreKey(key)
if (!vim.insertMode && s.prompt === null) s.clock.group++          // one undo group per normal/visual key; insert and prompt sessions inherit
try {
  if (s.prompt !== null) routePromptKey(s, key)
  else {
    if (core === "<Esc>" && !vim.insertMode && !vim.visualMode && plugin.query) {   // A:1470-1479
      const st = vim.searchState_; if (st) { s.cm.removeOverlay(st.getOverlay()); st.setOverlay(null) }
    }
    vim.status = (vim.status || "") + core                           // A:1485; multiSelectHandleKey's multiselect-<Esc> branch reads it (C:7114)
    const handled = Vim.multiSelectHandleKey(s.cm, core, "user")     // A:1486 — never Vim.handleKey
    vim = Vim.maybeInitVimState_(s.cm)                               // A:1487
    if (!handled && vim.insertMode) insertFallback(s, key, vim)
  }
} catch (e) { s.lastError = e instanceof Error ? e.message : String(e) }   // ex errors (C:5683-5686) and findKey crashes (state already reset, C:1050-1060); the key still counts
finally { s.feeding = false }
forceParsing(s.view, s.view.state.doc.length, 1e9)                   // tree complete before the next key so = / >> never depend on the 20 ms budget
redraw: (s.cm.state.vimPlugin as VimPluginLike).blockCursor.scheduleRedraw()   // cosmetic half-height pending cursor (A:1503)
s.solved = s.view.state.doc.toString() === s.target
return { solved: s.solved, docChanged: !s.view.state.doc.eq(before), error: s.lastError }
```

`insertFallback(s, key, vim)`:

```
const lit = literalOf(key)
if (s.cm.state.overwrite) {                                          // replace mode, A:1489-1498
  if (key === "<BS>") { recordInsertKey("Backspace"); CodeMirror.commands.cursorCharLeft(s.cm) }
  else if (key === "<CR>") s.cm.replaceSelection("\n")
  else if (key === "<Del>") { recordInsertKey("Delete"); insertCommands.Delete(s.view) }
  else if (lit !== undefined) s.cm.operation(() => { s.cm.curOp.isVimOp = true; s.cm.overWriteSelection(lit) })
  else /* named/modified key the core does not bind */ nothing
} else {
  if (key === "<BS>") { recordInsertKey("Backspace"); insertCommands.Backspace(s.view) }
  else if (key === "<Del>") { recordInsertKey("Delete"); insertCommands.Delete(s.view) }
  else if (key in {"<Left>","<Right>","<Up>","<Down>","<Home>","<End>"}) insertCommands[name](s.view)
  else if (lit !== undefined) s.cm.replaceSelection(lit)             // same call as the core's own '.' replay (C:7050)
  else nothing                                                       // <C-v>, <C-x>, <PageUp>, <S-Left>, ...: counted no-ops on both sides
}
```

`overWriteSelection` (A:721) dispatches the widened selection before the text; outside a vim operation the core reads that as a cursor move (C:6898) and drops everything but the last character from the `.`/macro record, so the call runs as one vim op (added after implementation; the stock adapter has this bug). `<CR>` in replace mode inserts a line break and deletes nothing, as in vim (`:help Replace`).

The core's `onChange` recorder (attached in `enterInsertMode`, C:3118) sees every insert-mode change through the adapter's `update() → cm.onChange → onBeforeEndOperation` (A:1380-1389, 598-660) regardless of who dispatched it, so typed text is recorded for `.`/macros; only `<BS>`/`<Del>` need the explicit `InsertModeKey`, and it must be pushed **before** the deletion is dispatched (same order as DOM keydown → native delete).

### 3.12 `snapshot.ts`

```ts
export type VimMode = "normal" | "insert" | "replace" | "visual" | "visual line" | "visual block";
export interface HudState {
  mode: VimMode; insertModeReturn: boolean; pending: string;
  prompt: { prefix: string; value: string } | null; message: string | null;
  recording: string | null; solved: boolean; error: string | null; keysFed: number;
}
export function sessionSnapshot(s: EditorSession): HudState;
```

`mode` from `cm.state.vim.mode` (adapter upkeep on `vim-mode-change`, A:1343-1354) with `cm.state.overwrite` → `"replace"`; `pending = vim.status` (cleared by the adapter on `vim-command-done`); `recording = ms.isRecording ? ms.latestRegister : null`; `message = s.message?.text ?? null`. Pure read.

### 3.13 `browserInput.ts` (engine-owned, installed only by the web)

```ts
export type BlockedReason = "ime" | "dead" | "meta" | "fkey" | "unfocused";
export interface BrowserInputOptions {
  platform: Platform;
  intercept?(key: VimKey, e: KeyboardEvent): boolean;   // UI chords and ready keys: consumed, never logged or fed
  accept?(): boolean;                                    // false during study and after the round ends: swallowed, not logged
  onKey(key: VimKey, result: KeyResult): void;           // the web appends `key` to the round log here
  onBlocked?(reason: BlockedReason): void;
  onFocus?(focused: boolean): void;
  devGuard?: boolean;                                    // import.meta.env.DEV: warn on unlogged doc/selection changes
}
export function browserInput(session: () => EditorSession, opts: BrowserInputOptions): Extension;
```

The extension needs the session it is part of, so it takes a getter and is passed directly in `createSession`'s `extraExtensions`; the getter resolves after `createSession` returns.

Extension contents:

```ts
[
  Prec.highest(EditorView.domEventHandlers({
    keydown(e, view) {
      if (e.key === "Dead" || e.key === "Process" || e.isComposing) { opts.onBlocked?.(e.key === "Dead" ? "dead" : "ime"); return true }
      if (e.metaKey) { opts.onBlocked?.("meta"); return true }        // Cmd/Win combos never reach vim or the browser (Cmd+A would move the native selection unlogged)
      const key = keyFromEvent(e, opts.platform)
      if (key === undefined) { if (/^F\d/.test(e.key)) opts.onBlocked?.("fkey"); return true }
      if (opts.intercept?.(key, e)) return true
      if (!(opts.accept?.() ?? true)) return true
      const result = feedKey(session(), key)
      opts.onKey(key, result)
      return true
    },
    keypress: () => true, beforeinput: () => true,
    paste: () => true, drop: () => true, cut: () => true, copy: () => true, dragstart: () => true, dragover: () => true, contextmenu: () => true,
    mousedown(e, view) { view.focus(); return true },                 // preventDefault on mousedown also cancels focus-on-click
    focus() { opts.onFocus?.(true); return false }, blur() { opts.onFocus?.(false); return false },
  })),
  Prec.highest(EditorView.inputHandler.of(() => true)),              // any DOM-originated text is dropped; CM redraws from state
  opts.devGuard ? EditorView.updateListener.of(u => { if ((u.docChanged || u.selectionSet) && !session().feeding) console.warn("[yank-wars] unlogged editor change", u.transactions.map(t => t.annotation(Transaction.userEvent))) }) : [],
]
```

`copy` is **also** prevented (it is a Meta/Ctrl combo); players copy from the result card. The editor is a focus trap during a round (Tab never leaves it); documented in the study overlay hint.

### 3.14 `replay.ts`

```ts
export interface ReplayResult { doc: string; solved: boolean; solvedAt: number | null; applied: number; errors: { index: number; message: string }[]; hud: HudState }
export interface ReplayOptions { parent?: HTMLElement; stopAtSolve?: boolean /* default true */ }
export function replay(puzzle: Puzzle, keys: readonly VimKey[], opts?: ReplayOptions): ReplayResult;
export function verifyRun(puzzle: Puzzle, log: KeyLog, opts?: Pick<ReplayOptions, "parent">): { ok: boolean; score: number; result: ReplayResult };
```

`replay`: `s = createSession(puzzle, { parent: opts.parent ?? document.body })` (which resets global vim state); `try { for i: r = feedKey(s, keys[i]); applied = i + 1; if (r.error) errors.push({index: i, message: r.error}); if (r.solved && solvedAt === null) { solvedAt = i; if (stopAtSolve) break } } finally { destroySession(s) }`. `applied` counts every key fed (a run that never solves has `applied === keys.length`); `solvedAt` is the first solving key, since later keys still report `solved` after lock-in. Requires DOM globals (happy-dom in tests/server, real DOM in the dev self-check). It resets process-global vim state: never call while a live session on the same page still accepts keys. `verifyRun`: `keys = currentRun(log)`; `ok = result.solvedAt === keys.length - 1` (the last key must be the solving key, so par is honest and the client's own lock-in is confirmed); `score = keys.length`.

### 3.15 `round.ts`

```ts
export const ROUND = { studyMs: 5_000, capMs: 240_000 } as const;
export type RoundPhase = "study" | "playing" | "locked" | "forfeited" | "expired";
export interface RoundState {
  readonly phase: RoundPhase; readonly createdAt: number; readonly studyEndsAt: number;
  readonly startedAt: number | null; readonly endsAt: number | null; readonly finishedAt: number | null;
  readonly log: KeyLog; readonly runs: number; readonly capMs: number;   // capMs: from cfg, read when study ends
}
export type RoundEvent = { type: "tick" } | { type: "ready" } | { type: "key"; key: VimKey; solved: boolean } | { type: "reset" } | { type: "forfeit" };
export type RoundConfig = { readonly [K in keyof typeof ROUND]: number };            // ROUND is `as const`, so Partial<typeof ROUND> would accept only the defaults
export function createRound(now: number, cfg?: Partial<RoundConfig>): RoundState;   // phase "study", studyEndsAt = now + studyMs
export function reduceRound(s: RoundState, e: RoundEvent, now: number): RoundState;  // returns `s` itself when nothing changes
export function elapsedMs(s: RoundState, now: number): number;    // 0 in study; now - startedAt while playing; frozen at finishedAt after
export function remainingMs(s: RoundState, now: number): number;  // max(0, endsAt - now) while playing, else 0
```

Transitions: `study`: `ready` or `tick` with `now >= studyEndsAt` → `playing` (`startedAt = now`, `endsAt = now + capMs`); keys/reset/forfeit ignored. `playing`: `key` → `log + key`, and `solved` → `locked` (`finishedAt = now`); `reset` → `log + RESET`, `runs + 1`; `forfeit` → `forfeited`; `tick` with `now >= endsAt` → `expired`. While playing, **any** event at `now >= endsAt` expires the round first, so a late key is neither logged nor locked in; an expired round has `finishedAt = endsAt` (elapsed freezes at the cap), a forfeited one `finishedAt = now`. Terminal phases ignore everything. Grace timer and ranking belong to step 2 and are not built now.

---

## 4. `apps/web`

Svelte 5 runes only, no stores. Keyboard-only; every key action also has a mouse button.

### 4.1 Component tree

```
App.svelte                hash router: #/ -> PuzzleList, #/p/<id> -> Round {#key id}
├ PuzzleList.svelte       title, language, par, lines, personal best; j/k/arrows move, Enter opens
└ Round.svelte            owns `const ctl = new RoundController(puzzle, prefs, clock)`; onDestroy -> ctl.destroy()
  ├ Hud.svelte            title + language chip; counter "<keys> / par <par>" (amber + "+N" above par); clock m:ss.t; "run N" when runs>1; cap bar; buttons: reset, give up, line numbers
  ├ Panes.svelte          two <section bind:this>; $effect: ctl.mount(playerHost, targetHost) -> cleanup ctl.unmount(); class:locked pulse 400 ms; class:flash on reset
  ├ StatusLine.svelte     mode pill (-- NORMAL -- / -- INSERT -- / -- VISUAL LINE -- / (insert) C-O), pending keys, prompt (prefix + value + block caret), "recording @q", vim message, blocked-key hint ("dead keys/IME unsupported", "Ctrl+W closes the tab in Chrome"), "<n> lines off", chord hint
  ├ StudyOverlay.svelte   while phase === "study": countdown ring, "Space or Enter when ready", lists the chords once
  ├ FocusHint.svelte      while !ctl.focused: "click to focus"
  └ ResultCard.svelte     while phase in locked/forfeited/expired (after the pulse for locked): headline, keys vs par + delta, time, runs, final-run notation in <pre> with Copy, collapsed par solution, source credit, personal best, DEV self-check badge; keys: Enter next, r retry, s solution, c copy, Esc list
```

### 4.2 `RoundController` (`src/lib/round.svelte.ts`)

```ts
export class RoundController {
  round = $state.raw<RoundState>(createRound(this.clock()));
  snap = $state.raw<HudState>(initialHud);
  now = $state(0);
  linesOff = $state(0); flash = $state(0); focused = $state(false); blocked = $state<BlockedReason | null>(null);
  selfCheck = $state<"off" | "pending" | "ok" | "mismatch">("off");
  phase = $derived(this.round.phase); keys = $derived(scoreOf(this.round.log)); delta = $derived(this.keys - this.puzzle.par);
  elapsed = $derived(elapsedMs(this.round, this.now)); remaining = $derived(remainingMs(this.round, this.now));
  private player: PlayerView | null = null; private target: TargetView | null = null; private raf = 0;
  constructor(readonly puzzle: Puzzle, readonly prefs: Prefs, private readonly clock: () => number) {}
  mount(playerHost: HTMLElement, targetHost: HTMLElement): void;
  unmount(): void;        // destroy views, cancel raf
  reset(): void;          // phase playing only: dispatch {reset}; destroy + recreate the player view (fresh session = fresh global vim state, fresh history); flash++
  forfeit(): void;        // phase playing only
  toggleNumbers(): void;  // prefs.relativeNumbers = !..; player.setRelativeNumbers(..)
  destroy(): void;
}
```

Behaviour: `mount` creates the player view with `{ platform: detectPlatform(navigator), intercept: k => this.intercept(k), accept: () => this.phase === "playing", onKey: (k, r) => this.onKey(k, r), onBlocked: r => (this.blocked = r), onFocus: f => (this.focused = f), devGuard: import.meta.env.DEV, onDoc: doc => { this.linesOff = ...; this.target?.setPlayerDoc(doc) }, relativeNumbers: prefs.relativeNumbers }`, the target view, focuses the editor, and starts a `requestAnimationFrame` loop that sets `now` and dispatches `{type: "tick"}` while phase is study/playing. `intercept(key)`: `RESET_KEY` → `reset()`; `FORFEIT_KEY` → `forfeit()`; `NUMBERS_KEY` → `toggleNumbers()`; study phase and `READY_KEYS.includes(key)` → dispatch `{ready}`; all return `true`; otherwise `false`. `onKey(key, result)`: dispatch `{type: "key", key, solved: result.solved}`; `snap = sessionSnapshot(session)`; `blocked = null`; if `result.solved` → `onLocked()`. `dispatch(e, now = clock())`: `next = reduceRound(round, e, now); if (next !== round) round = next`. `accept()` reads the clock once per keydown and `onKey` dispatches the key at that same time, so a key whose feed crosses the cap is still logged (it already changed the buffer). An expired or forfeited round shows the result card in a later task (`setTimeout 0`), never inside the keydown that ended it, which would otherwise reach the card's window listener (Esc, Enter, `r`). `onLocked()`: in DEV, `selfCheck = "pending"` then `queueMicrotask` → `runSelfCheck(puzzle, round.log, liveDoc)` → `"ok" | "mismatch"` (console.warn with the notation string, both docs and the first differing line on mismatch); record personal best in prefs. The round clock never pauses on reset (decisions.md).

Chords (`src/lib/chords.ts`): `RESET_KEY = "<C-CR>"`, `FORFEIT_KEY = "<C-S-CR>"`, `NUMBERS_KEY = "<C-S-L>"` (Ctrl+Shift+l has `e.key === "L"`), `READY_KEYS = ["<Space>", "<CR>"]`. All are layout-independent and never collide with AltGr characters.

### 4.3 Editor wiring (`src/editor/playerView.ts`)

```ts
export interface PlayerViewOptions extends Omit<BrowserInputOptions, "onKey"> { parent: HTMLElement; puzzle: Puzzle; relativeNumbers: boolean; onKey(key: VimKey, result: KeyResult): void; onDoc(doc: Text): void }
export interface PlayerView { readonly session: EditorSession; setRelativeNumbers(on: boolean): void; focus(): void; destroy(): void }
export function createPlayerView(opts: PlayerViewOptions): PlayerView;
```

Implementation: `let session!: EditorSession; const numbers = new Compartment(); session = createSession(puzzle, { parent, extraExtensions: [browserInput(() => session, opts), ywTheme, syntaxHighlighting(oneDarkHighlightStyle), drawSelection(), highlightActiveLine(), numbers.of(relativeNumbers ? relativeGutter : absoluteGutter), diffField(targetText), EditorView.updateListener.of(u => { if (u.docChanged) opts.onDoc(u.state.doc) })] })`. `drawSelection()` is required: the adapter hides the native selection layer and expects it for visual-mode highlighting. Everything that can edit text comes from `engineExtensions` inside `createSession`; this list is visuals, blockers and listeners only. `setRelativeNumbers(on)` dispatches `numbers.reconfigure(...)` (effects-only: untouched by the undo filter, not in the log). The pane's font size is `clamp(12px, 1.6vh, 15px)` so 30 lines fit without scrolling (the virtual-window motions assume the whole puzzle is visible).

### 4.4 Target pane (`src/editor/targetView.ts`)

```ts
export interface TargetView { setPlayerDoc(doc: Text): void; destroy(): void }
export function createTargetView(parent: HTMLElement, puzzle: Puzzle): TargetView;
```

`new EditorView({ state: EditorState.create({ doc: puzzle.target, extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.domEventHandlers({ mousedown: () => true, contextmenu: () => true }), EditorView.theme({ ".cm-content": { userSelect: "none", cursor: "default" } }), languageExtension(puzzle.language), ywTheme, syntaxHighlighting(oneDarkHighlightStyle), absoluteGutter, targetDiffField(Text.of(puzzle.start.split("\n")))] }), parent })`. No `vim()`: not a vim buffer, cannot be yanked from or focused. `setPlayerDoc` dispatches a `setPlayerDoc` StateEffect that the target diff field consumes.

### 4.5 Diff highlight (`src/editor/diff.ts`)

`diffField(target: Text): StateField<{ deco: DecorationSet; linesOff: number }>`: `create`/`update` (on `docChanged`) run `Chunk.build(doc + "\n", target + "\n", { scanLimit: 500 })` from `@codemirror/merge` (both with one more newline: otherwise a change at the end of a doc is widened back to the previous, correct line); for each chunk decorate lines `doc.lineAt(chunk.fromA)` … `doc.lineAt(chunk.endA)` with `Decoration.line({ class: "yw-diff" })` (`endA` is already the end of the chunk's last line; `endA - 1` would drop a trailing empty line), and insertion-only chunks (`fromA === toA`, lines missing in the buffer) with `Decoration.line({ class: "yw-diff-missing" })` on `doc.lineAt(chunk.fromA)` (a dashed line above it), or, when `fromA` is past the end, `yw-diff-missing-after` on the last line (dashed line below it); `linesOff` = decorated lines + missing-line chunks; `provide: f => EditorView.decorations.from(f, v => v.deco)`. `targetDiffField(start: Text)` holds the current player doc (updated by the `setPlayerDoc` effect) and decorates the target's `fromB..endB` lines with `yw-pending` (chunks empty on the target side mark nothing). `MergeView`/`unifiedMergeView` are not used: they own the views' dispatch and add widgets/controls that edit text. Export `linesOffOf(state)` for the HUD.

### 4.6 Gutter (`src/editor/gutter.ts`)

```ts
class NumberMarker extends GutterMarker { constructor(readonly n: string) { super() } eq(o: NumberMarker) { return o.n === this.n } toDOM() { return document.createTextNode(this.n) } }
export const relativeGutter = gutter({ class: "cm-lineNumbers", lineMarker(view, line) { const cur = view.state.doc.lineAt(view.state.selection.main.head).number; const n = view.state.doc.lineAt(line.from).number; return new NumberMarker(n === cur ? String(n) : String(Math.abs(n - cur))) }, lineMarkerChange: u => u.selectionSet || u.docChanged, initialSpacer: () => new NumberMarker("99"), renderEmptyElements: false });
export const absoluteGutter = lineNumbers();
export function relativeFormat(cur: number, n: number): string;   // the pure formatter, for tests
```

`lineNumbers({formatNumber})` alone goes stale on cursor moves (the stock gutter re-renders only on doc/viewport/config change, V:11878); the custom gutter's `lineMarkerChange` fixes it. Default on; persisted in `localStorage` (try/catch).

### 4.7 Theme (`src/editor/theme.ts`)

Tokens: `--bg #0d1117`, `--panel #161b22`, `--border #30363d`, `--fg #e6edf3`, `--muted #8b949e`, `--ok #3fb950`, `--warn #d29922`, `--bad #f85149`, `--cursor #f2cc60`. `ywTheme = EditorView.theme({...}, { dark: true })` (so the adapter's and merge's `&dark` rules apply); fat cursor via `"&.cm-editor.cm-focused .cm-fat-cursor"` (background `var(--cursor)`) and `"&.cm-editor:not(.cm-focused) .cm-fat-cursor"` (1px outline in it) (the adapter's rules are `Prec.highest`, A:1197-1215, so beat them by specificity; `&.cm-editor .cm-fat-cursor` only ties and loses); `.yw-diff` `rgba(248,81,73,.10)` + a 2px left bar as an inset box-shadow (no layout shift between the side-by-side panes); `.yw-diff-missing` a dashed line on the top edge (it sits on the line after the gap); `.yw-pending` `rgba(88,166,255,.08)`; `.cm-vim-panel`/`.cm-vim-message` are never rendered (no dialogs). Syntax colours from `oneDarkHighlightStyle`.

### 4.8 HUD, study, reset, result

- Counter is the largest element besides the code; `keys` ticks on every key including `u`, `:`, `/`, `<BS>`.
- Study: both panes visible, diff tinted; `accept()` false swallows all keys; Space/Enter → ready; countdown from `studyEndsAt - now`.
- Reset: `<C-CR>` or HUD button; appends `RESET`, `runs++`, fresh player view (fresh history and global vim state), counter 0, clock keeps running, cap bar keeps draining.
- Lock-in: the editor stops accepting keys (`accept()` false), 400 ms green pulse, then the result card. Expired/forfeited show "Time's up"/"Gave up" with retry on `r`.
- Result card copy box: `formatKeys(currentRun(round.log))`; par solution: `formatKeys(puzzle.solution)`.

### 4.9 Dev self-check (`src/dev/selfCheck.ts`)

```ts
export function runSelfCheck(puzzle: Puzzle, log: KeyLog, liveDoc: string): "ok" | "mismatch";
```

Only when `import.meta.env.DEV`. Creates a hidden host (`position:fixed; left:-9999px; top:0; width:600px; height:400px`; fixed because CM6's `scrollRectIntoView` stops at fixed ancestors, V:554, so the replay never scrolls the page) appended to `document.body`, calls `verifyRun(puzzle, log, { parent: host })`, removes the host, returns `"ok"` iff `result.ok && result.result.doc === liveDoc`; on mismatch or a throwing replay it logs the 4.2 warning itself. Runs only after the round is over (replay resets process-global vim state).

### 4.10 Puzzle loading (`src/lib/puzzles.ts`)

`const files = import.meta.glob("../../../../puzzles/handmade/*.json", { eager: true, import: "default" })`; `export const puzzles: Puzzle[] = Object.entries(files).map(([path, json]) => parsePuzzle(json, idFromPath(path))).sort(by title)`. `vite.config.ts` allows the workspace root for `server.fs`.

---

## 5. Puzzles

### 5.1 Schema (JSON on disk)

```ts
interface PuzzleJson {
  id: string;              // ^[a-z0-9]+(-[a-z0-9]+)*$, 3..40 chars, equals the file name
  title: string;           // 1..60 chars
  description?: string;    // <= 200 chars
  language: LanguageId;
  tabSize: 2 | 4 | 8;
  indentUnit: "  " | "    " | "\t";
  start: string;
  target: string;
  solution: string;        // vim notation; par = parseKeys(solution).length (never stored)
  source: PuzzleSource;
  tags?: string[];
}
```

Example (`puzzles/handmade/quote-style.json`):

```json
{
  "id": "quote-style",
  "title": "Double quotes",
  "description": "The linter wants double quotes.",
  "language": "javascript",
  "tabSize": 2,
  "indentUnit": "  ",
  "start": "const names = ['ada', 'linus', 'grace'];\nconst greet = (n) => `hi ${n}`;\nexport default names.map(greet);",
  "target": "const names = [\"ada\", \"linus\", \"grace\"];\nconst greet = (n) => `hi ${n}`;\nexport default names.map(greet);",
  "solution": ":s/'/\"/g<CR>",
  "source": { "kind": "original", "author": "yank-wars" },
  "tags": ["substitute"]
}
```

### 5.2 Authoring rules (enforced by `PuzzleJsonSchema` unless marked *test*)

1. `start`/`target`: LF only (no `\r`); **no trailing newline** (CM has no final line terminator; lock-in is `doc.toString() === target`; a trailing `\n` would be an extra empty line the player must create); 1..30 lines; each line ≤ 120 chars (no wrapping exists); ≤ 3000 chars each (keeps the whole document inside `@codemirror/language`'s initial 3000-char synchronous parse); printable ASCII 0x20-0x7E plus `\t`/`\n` only (typeable on every layout; dead keys are unsupported); `start !== target`; `target` non-empty.
2. Tabs may appear only when `indentUnit === "\t"`. `indentUnit`/`tabSize` are engine config (`>>`, `<<`, `=`, rendering), so they belong to the puzzle.
3. `solution`: parseable by `parseKeys` (a literal `<` is `<lt>`, a space is `<Space>` or `" "`); *test*: `replay(puzzle, solution).solvedAt === solution.length - 1` (no trailing no-op keys, so par is honest) and `doc === target`; `replay(puzzle, [])` is not solved.
4. Engine semantics authors must know: `o`/`O`/insert `<CR>` insert a plain newline (no autoindent); `/` and `:s` use **vim** regex syntax (`\(` `\)` `\+` `\<` `\>` `\{n\}`; `\<` is `\<lt>` in key notation), hard-coded ignorecase+smartcase for both `/` and `:s`; `&` in a `:s` replacement is literal (`\0` is the whole match); replace-mode `<BS>` moves left without restoring, and `.`/`@q` then repeat only what followed the last `<BS>`; `:map`/`:set`/`:w`/`:colorscheme` are blocked; `"+`/`"*` are the unnamed register; `H/M/L/<C-d>/<C-u>/<C-f>/<C-b>` work on a virtual 30-line window; `<C-e>/<C-y>/zz/zt/zb` do nothing; the command line is append-only (`<Left>`/`<Right>`/`<Tab>` are counted no-ops); the two known engine bugs (macro does not abort on a failed motion; a recursive macro runs until it is nested 100 deep and then errors) are unpatched in step 1, so solutions must not rely on them; `cc`/`S` drop the indent like `o` (noautoindent); `:m`/`:t`/`:e`/`:r`/`:!` do not exist.
5. `source` required; `excerpt` needs `repo`, permalink `url`, allowed `license`, `path`, `commit`, shown on the result card. Prefer original snippets. VimGolf challenges only with the maintainer's permission.
6. Puzzles are data: no code under `puzzles/`; loaded through `parsePuzzle` at the boundary (engine tests via `Bun.Glob`, web via `import.meta.glob`). *test*: ids unique, equal to file names.

### 5.3 The ten handmade puzzles (all original snippets written for this repo)

| id | title | language | start → target | reference solution | par |
|---|---|---|---|---|---|
| `quote-style` | Double quotes | javascript | 3-line module; single-quoted strings on line 1 → double quotes | `:s/'/"/g<CR>` on the current line | 9 |
| `rename-var` | Rename `data` | typescript | 8-line function using `data` 4× (plus `metadata` once, which must not change) → `payload` | `:%s/\<lt>data\>/payload/g<CR>` (vim regex, nopcre; `\<` is `\<lt>` in key notation) | 23 |
| `swap-args` | Swap the arguments | python | 6 lines: `def area(width, height)` and three calls `area(a, b)` → arguments swapped in every pair | `:%s/(\(\w\+\), \(\w\+\))/(\2, \1)/<CR>` | 35 |
| `sort-imports` | Sort the imports | go | 8-line file with an unsorted `import ( ... )` block of 4 paths → sorted | `:4,7sor<CR>` | 8 |
| `join-lines` | One line | rust | `let v = vec![\n    1,\n    2,\n    3,\n];` → `let v = vec![1, 2, 3];` | `Jx4JXx` | 6 |
| `comment-block` | Comment out the body | python | 6-line function; 4 body lines → each prefixed `# ` | `2jw<C-v>3jI#<Space>` (visual block, allowMultipleSelections; locks in before `<Esc>`) | 9 |
| `quote-keys` | Quote the keys | json | 5-line object with bare keys `{a: 1, ...}` → `"a": 1` | `:%s/\w\+/"\0"/<CR>` (`&` is literal under nopcre, so `\0`) | 15 |
| `wrap-in-call` | Stringify | python | 3 assignments `x = expr` → `x = str(expr)` | `qaf=wistr(<Esc>A)<Esc>+q2@a` (macro, insert-mode recording; `+`, not `j`, so `f=` never fails) | 19 |
| `css-comment` | Disable the rule | css | 4-line rule → wrapped in `/*` and `*/` lines | `O/*<Esc>Go*/` (plain-newline `o`/`O`; locks in before `<Esc>`) | 8 |
| `indent-body` | Indent the body | go | function with an unindented 3-line body → indented by one `\t` | `j3>>` (uses `indentUnit`) | 4 |

Authors write the solution, prove it with `bun test packages/engine/src/puzzles.test.ts`, and adjust par to the proven length (listed in that file's `PAR`). The design draft's solutions for `comment-block` and `css-comment` ended in a wasted `<Esc>` after lock-in, and its `wrap-in-call` macro failed in vim and in the engine; the table holds the proven ones.

---

## 6. Tests

All `bun:test`, run from the repo root (`bunfig.toml` preload installs happy-dom). Tests call the public API as the web and the future server do and assert literal buffers.

**`packages/engine/src/keys.test.ts`** — `parseKeys("ihello<Esc>")` → `["i","h","e","l","l","o","<Esc>"]`; `parseKeys("a<lt>b c")` → `["a","<lt>","b","<Space>","c"]`; `formatKeys(parseKeys(x)) === x` for every spike case string and every puzzle solution (after `" "` → `<Space>` canonicalisation); `<cr>`/`<esc>`/`<c-v>` normalise to `<CR>`/`<Esc>`/`<C-v>`; `parseKeys("a<b")`, `parseKeys("<Foo>")`, `parseKeys("<Reset>")`, `parseKeys("<M-x>")`, `parseKeys("<S-a>")` throw `KeyNotationError`; `isVimKey("<C-S-A>")` true; `toCoreKey("<lt>") === "<"`; `keyToDomKey("<CR>")` → `{key:"Enter", keyCode:13,...}`; `keyToDomKey("<C-S-Left>")` → `{key:"ArrowLeft", keyCode:37, ctrlKey:true, shiftKey:true}`.

**`keyFromEvent.test.ts`** — table (platform `other` unless stated): `a`→`a`; Shift+a (`key:"A"`)→`A`; Ctrl+a→`<C-a>`; Ctrl+Shift+a (`key:"A"`)→`<C-S-A>`; `" "`→`<Space>`; Shift+Space→`<Space>`; Shift+Enter→`<CR>`; Shift+Tab→`<Tab>`; Shift+Backspace→`<BS>`; Shift+ArrowLeft→`<S-Left>`; Ctrl+Alt+ArrowLeft→`<C-A-Left>`; Enter/Backspace/Delete/Escape/Insert/Tab/arrows/Home/End/PageUp/PageDown→their names; `<`→`<lt>`; `>`→`>`; AltGr `{` (ctrl+alt, `key:"{"`)→`{`; mac Option+s (`key:"ß"`, alt)→`ß`; other Alt+s→`<A-s>`; Ctrl+v→`<C-v>`; `ü`→`ü`; emoji (2 code units, 1 code point)→itself; Meta+c→undefined; Shift/Control/Alt/Meta/CapsLock/Dead/Process/Unidentified/AltGraph alone→undefined; F1..F12→undefined; `isComposing`→undefined; `repeat: true` still returns the key. Agreement test: iterate printable ASCII × {none, ctrl, ctrl+shift} and all 15 named DOM keys × {none, shift, ctrl}; `keyFromEvent(e, "other")` equals `Vim.vimKeyFromEvent(e as KeyboardEvent)` except the documented normalisations (asserted explicitly as an allow-list).

**`log.test.ts`** — `scoreOf([])` 0; `scoreOf(["a","b"])` 2; `scoreOf(["a",RESET,"b"])` 1; `scoreOf(["a",RESET])` 0; `runs(["a",RESET,RESET,"b"])` → `[["a"],[],["b"]]`; `currentRun` of the same → `["b"]`; `isVimKey(RESET)` false.

**`puzzle.test.ts`** — the example parses with `par === 9` (its solution is 9 keys); rejects: trailing `\n` in `start`, `\r\n`, 31 lines, a 121-char line, 3001 chars, `ü`, a tab with `indentUnit: "  "`, `start === target`, bad `id` (`Quote_Style`), `id !== expectedId`, unknown language, `solution` with a bare `<`, `excerpt` without `commit`; each error message names the field path.

**`round.test.ts`** — `createRound(1000)` → study, `studyEndsAt 6000`; tick at 5999 stays study, at 6000 → playing with `startedAt 6000`, `endsAt 246000`; `ready` at 2000 → playing at 2000; keys during study ignored (same object returned); `key` appends; `key` with `solved` → locked, `finishedAs 7000`; keys after locked ignored; `reset` → log ends with `RESET`, `runs 2`, `scoreOf` 0; tick at `endsAt - 1` playing, at `endsAt` → expired; `forfeit` → forfeited; `elapsedMs` 0 in study, frozen after lock; `remainingMs` clamps at 0.

**`replay.test.ts`** — the spike's 19 cases as a table (start, keys, expected doc), 17 asserting the exact doc, the two known-bug cases (`jqqddjq3@q` on 5 lines expecting `1\n3\n5`; recursive macro) as `test.failing` referencing decisions.md. Additional cases (doc and `solvedAt`): `ihelo<BS>lo<Esc>j.` on `\n` → `hello\nhello`; `qqihelo<BS>lo<Esc>jq@q` → both lines `hello`; `iab<Del>c<Esc>` on `xy` → `abcy`; `Rxy<BS>z<Esc>` on `abcd` → `xzcd`; `R<CR>` on `ab` → `\nab` (vim inserts a line break and deletes nothing) and `R<CR>x<Esc>` → `\nxb`; `Rxy<Esc>j0.`, `qqRxy<Esc>jq0@q` on `abcd\nabcd` → `xycd\nxycd`, `Rxy<Esc>j02.` → `xycd\nxyxy`; `ia<Space>b<lt><Tab>c<Esc>` → `a b<\tc`; `i<C-v>x<Esc>`, `i<PageUp>x<Esc>`, `i<S-Left>x<Esc>` → `x` (no-ops still count: `applied` 4); `"ayiwo<C-r>a<Esc>` on `foo` → `foo\nfoo`; `ihello<C-w>x<Esc>` → `x`; `i<Ins>xy<Esc>` on `abc` → `xyc`; `<C-v>jIZ<Esc>` and `<C-v>jAZ<Esc>` on `ab\ncd` → `Zab\nZcd` / `aZb\ncZd`; `dd` on the last line; `5j` on 3 lines lands on the last; `gjgjx` = `jjx`; on a 25-line doc `Hx`, `Mx`, `Lx`, `3Hx`, `<C-d>x`, `<C-u>x`, `<C-f>x`, `<C-b>x`, `<C-e>x`, `<C-y>x`, `zzx` delete the char on lines 1, 13, 25, 3, 16, 1, 25, 1, 1, 1, 1 respectively (0-based: 0, 12, 24, 2, 15, 0, 24, 0, 0, 0, 0); `o` after `{` in a javascript puzzle inserts an **unindented** line and `A<CR>` too; `V>` in a go puzzle with `indentUnit "\t"` prepends a tab, in a python puzzle with `"    "` four spaces; `==` on a misindented javascript body re-indents (language is engine config); `:g/x/d<CR>` on `x1\ny\nx2` with target `y\nx2` → `solvedAt === null`; `stopAtSolve` stops feeding after the solving key (`applied === solvedAt + 1`), `stopAtSolve: false` feeds all; a run ending in insert mode with a matching buffer locks in; `"+yyjp` pastes the yanked line; `<C-r>+` in insert inserts nothing; a crashing replay (recursive macro, stopped at the depth limit) is followed by the `:%s/foo/X/g` case passing (no poisoning via `createSession`'s reset); runaway recursion inside `:norm @q` stops with the same error and leaves later `:` and `/` prompts working; two consecutive replays: `qaAx<Esc>q` then `@a` in the second does nothing; `verifyRun` with a `parent` mounts there and leaves it empty. Added in review, with docs from real vim: ex commands, insert cursor keys, `<C-o>`, counts and `.` inside macros; `qQ` appends; a recursive macro gives the same doc on every run; `:normal` literal `<…>` and aborting; failing `j`/`k`/`+`/`<C-p>` and counted `r` at the buffer edge; replace-mode cursor keys; `g0`/`g^`; `cc`/`S` noautoindent; insert `<C-w>`/`<C-u>` stopping at the insert start.

**`prompt.test.ts`** — `:s/a/b/<CR>` on `a` → `b`; `:s/a/b/` + `<Esc>` → `a` and the next `x` deletes (prompt closed); `d:<Esc>x` on `ab` → `b` (operator cleared via `clearInputState`); `/zz<BS><BS><BS>` then `x` → cancelled on empty, `x` deletes; `/foo<CR>/<Up>` shows `foo` in the prompt and `/foo<CR>/bar<CR>/<Up><Up><CR>x` searches `foo` again, where a bare `/<CR>` would repeat `bar` (history via `onKeyDown`); `:foo<C-u>s/a/b/<CR>` → substitution ran; `:%s/a/b/gc<CR>yn` and `...a` and `...q` on `a a a` → `b a a`? no: `y` replaces 1st, `n` skips 2nd, prompt still open → `b a a` after `q`; `a` → `b b b`; the confirm run is one undo step; `<Tab>`, `<Left>`, `<Home>` inside a prompt leave `value` unchanged and the prompt open; `qa` banner: keys typed while recording still edit (CLAUDE.md trap); `:2,3norm @w<CR>` after `qwA!<Esc>jq` on `x\nx\nx` → `x!\nx!\nx!`; `:s/[/x<CR>` shows `hud.message === "Invalid regex: ["` with `hud.error === null` (core 0.1.0 catches bad regexes and reports them through `showConfirm`, not by throwing) and the run continues; `:%s/\(foo\) \(bar\)/\2 \1/<CR>` → `bar foo` and `/\<foo\><CR>x` skip `foobar` (nopcre survives reset); `:registers<CR>` then `<CR>` is swallowed (long notification) and the next `x` deletes; `:map a b<CR>` then `a` appends normally and `hud.message` says disabled; `:nn`, `:ino`, `:se nopcre`, `:w`, `:colo` likewise; `:set pcre<CR>` blocked so `\(` still works afterwards; `:s/data/x/g` on `Data data` → `x x` but `:s/Data/x/g` → `x data` (smartcase); `:s/a/[&]/` → `[&]b`, `:s/a/[\0]/` → `[a]b`.

**`undo.test.ts`** — each case run three times: real clock, `setSystemTime` advancing 10 s between keys, `setSystemTime` frozen; docs identical and equal to the literal: `ihello<Esc>u` on `one` → `one`; `xihello<Esc>u` on `one` → `ne`; `cwfoo<Esc>u` on `bar baz` → `bar baz`; `ohey<Esc>u` → start; `ihi<Esc>ohey<Esc>uu` → start; `3ix<Esc>u` → start; `xxu` on `abc` → `bc`; `ddp.u` on `one\ntwo\nthree` → `two\none\nthree`; `ihello<C-w>world<Esc>u` → start; `ia<BS>b<Esc>u` → start; `ifoo<Left>bar<Esc>u` → `foo`, `ifoo<Right>bar<Esc>u` → empty (no move, no split), `ifoo<End>bar<Esc>u` → `foo`; `<C-v>jIZ<Esc>u` → start; `:%s/a/b/g<CR>u` → start; `:g/x/d<CR>u` → start; `qqxjq2@qu` on `ab\ncd\nef` → `b\nd\nef` (only the last macro command undone); `qaA,<Esc>jq@au` on `a\nb` → `a,\nb`; `:g/^/norm Ax<CR>u` → start (ex command is one step); `xu<C-r>` redoes; a `numbers`-style compartment reconfigure and a `forceParsing` empty transaction between `x` and `u` do not break the join or add steps.

**`engineLock.test.ts`** — `lockEngine()` twice is a no-op; `Vim.resetVimGlobalState_()` then `applyEngineOptions()` leaves `getOption("pcre") === false`; blocked ex commands (every name and shortName) leave the doc unchanged and set `message`; `"+yy"+p` with `navigator.clipboard` undefined still works; with a spy clipboard, `:y +`, `:pu +`, `:pu! *`, `:g/^d/pu +`, `"+yy`, `"+p` and `<C-r>+` never call it, even after the async tick, and give vim's unnamed-register result; `yyj"+p` and `yyj"*p` paste the unnamed register; motion overrides give the documented lines (see replay list); `CodeMirror.commands.newlineAndIndent` inserts exactly `"\n"`.

**`browserInput.test.ts`** (headless, happy-dom `KeyboardEvent`s dispatched on `view.contentDOM`): with a real `createSession` + `browserInput`: dispatching `x` then `a`,`Z`,`Escape` logs `["x","a","Z","<Esc>"]`, the doc equals `replay()` of the same keys, every event is `defaultPrevented`; `Meta+a`, `Shift` alone, `Dead`, `Process`, `F5` log nothing and are `defaultPrevented`; `accept() === false` swallows `x` (doc unchanged, nothing logged) while `intercept` still receives `<Space>`; `<C-CR>` reaches `intercept` and never `onKey`; a synthetic `paste` event is `defaultPrevented`; `Ctrl+v` in insert mode is logged and leaves the doc unchanged; `devGuard` warns (spy on `console.warn`) when `view.dispatch({changes})` is called from outside `feedKey`. (Native text insertion cannot be exercised headless; stated in the file header.)

**`puzzles.test.ts`** — for every `puzzles/handmade/*.json` (`Bun.Glob`): `parsePuzzle(json, idFromFile)` succeeds; ids unique; `verifyRun(puzzle, puzzle.solution).ok`; `result.doc === target`; `replay(puzzle, []).solved === false`; `par` between 3 and 60.

**`apps/web/src/editor/diff.test.ts`** — `Chunk.build`-based field: for start `a\nb\nc` vs target `a\nX\nc` exactly line 2 has `yw-diff`, `linesOff === 1`; deleting line 2 yields one `yw-diff-missing` on the line at the gap; identical docs → no decorations, `linesOff 0`; inserting a line above re-aligns (lines below are not tinted); at the end of the buffer an extra line tints only itself and a missing last line marks the line above with `yw-diff-missing-after`, without tinting it; on the target side only the missing last line is pending. **`gutter.test.ts`** — `relativeFormat(5, 5) === "5"`, `relativeFormat(5, 2) === "3"`, `relativeFormat(5, 9) === "4"`.

**Tooling gates** — `bun run check` (tsc engine, svelte-check web, biome, preset grep), `bun test`, `bun run build`. **Manual checklist** (until Playwright, per decisions.md), in `apps/web/README.md`: Chrome/Firefox/Safari on macOS, Chrome on Windows: type each spike case in the real editor, compare the counter and buffer with the DEV self-check badge; Shift+Space inserts a space; AltGr `{` on a DE layout types `{`; dead key `'` on US-International shows the "dead key" hint and inserts nothing; click does not move the cursor; paste/drop/cut do nothing; `<C-CR>` resets; `<C-S-L>` toggles numbers and they follow the cursor; `:` prompt renders in the status line, `<Esc>` cancels, `<Up>` recalls; focus-loss hint appears; HMR works under `bun --bun vite`. Explicitly untested in step 1: real-keyboard behaviour (only fake events), IME/dead keys per OS, HMR.

---

## 7. Work split

Four implementers, disjoint file ownership. The engine's `src/index.ts` export list in section 3 is the frozen contract: Worker A commits it as compiling stubs (`throw new Error("todo")`) within the first hour, together with the root scaffolding, so everyone compiles against it from one `bun install`.

**Worker A — scaffolding + engine editor core.** Owns: root `package.json`, `bunfig.toml`, `tsconfig.base.json`, `biome.json`, `test/dom.ts`, `.gitignore`, `packages/engine/{package.json,tsconfig.json}`, `src/index.ts`, `src/vimSetup.ts`, `src/history.ts`, `src/insertKeys.ts`, `src/prompt.ts`, `src/session.ts`, `src/feedKey.ts`, `src/browserInput.ts`, `src/replay.ts`, and tests `replay/prompt/undo/engineLock/browserInput`. Order: stubs → session + history + insertKeys → feedKey → replay (spike cases green) → prompt → vimSetup overrides → browserInput → undo/lock tests. Consumes from B: `VimKey`, `toCoreKey`, `parseKeys` (first hour), `Puzzle`, `languageExtension`, `HudState`/`sessionSnapshot`.

**Worker B — engine pure modules + puzzles + CI.** Owns: `src/keys.ts`, `src/keyFromEvent.ts`, `src/log.ts`, `src/puzzle.ts`, `src/languages.ts`, `src/round.ts`, `src/snapshot.ts` and their tests, `src/puzzles.test.ts`, `puzzles/README.md`, `puzzles/handmade/*.json`, `.github/workflows/ci.yml`. Delivers `keys.ts` first (A and D depend on it). Writes solutions against section 5.2's semantics, proves them with A's `replay` once it lands; any failing solution is a puzzle bug or a parity finding for A.

**Worker C — web editor layer.** Owns: `apps/web/{package.json,tsconfig.json,vite.config.ts,svelte.config.js,index.html}`, `src/main.ts`, `src/editor/*` (playerView, targetView, diff, gutter, theme, tests), `src/dev/selfCheck.ts`. Provides to D exactly: `createPlayerView(opts: PlayerViewOptions): PlayerView`, `createTargetView(parent, puzzle): TargetView`, `runSelfCheck(puzzle, log, liveDoc): "ok" | "mismatch"`, `linesOffOf(state)`. Consumes: `createSession`, `browserInput`, `languageExtension`, `verifyRun`, `HudState`. Never imports `@codemirror/commands`, `@codemirror/lang-*` or `@replit/codemirror-vim`. Until A lands, C builds against a stub session (plain `EditorView` with the same `EditorSession` shape) that is deleted afterwards.

**Worker D — web app shell and round flow.** Owns: `src/App.svelte`, `src/app.css`, `src/lib/*` (`puzzles.ts`, `prefs.svelte.ts`, `clock.ts`, `chords.ts`, `round.svelte.ts`), `src/components/*`, `apps/web/README.md` (manual checklist), `CLAUDE.md` and `docs/decisions.md` updates (section 8). Consumes C's three functions and the engine's `round.ts`, `log.ts`, `keys.ts`, `snapshot.ts`, `puzzle.ts`.

**Integration order:** A stubs + scaffolding (hour 1) → B `keys.ts` (hour 2) → A/B/C/D in parallel → A's `replay` green on the spike cases → B's puzzles proven → C's views on A's real session → D's flow + self-check → everyone: `bun install`, `bun run check`, `bun test`, `bun run build` green from the root, then the manual checklist with the DEV self-check badge "ok" on all ten puzzles in Chrome, Firefox and Safari. Nobody edits another worker's files; interface changes go through `src/index.ts` with an ack from the consumers. Dependency additions go through the owner of that workspace via `bun add -E … --filter`.

**Acceptance criteria:** `bun install` (frozen lockfile in CI); `bun run check` exits 0; `bun test` exits 0 with the puzzle, parity, undo, prompt, lock and browserInput suites present; `bun run build` exits 0; the ten puzzles each lock in on their reference solution; a manual round in each listed browser ends with the self-check badge "ok".

---

## 8. Known deviations and deferrals

**From vim (parity-safe, same on both sides):**
- `o`/`O`, insert-mode `<CR>`, `cc` and `S` follow vim's `noautoindent`; `=`, `>>`, `<<` remain language-aware.
- `/` and `:s` use vim regex syntax (nopcre); both are always ignorecase+smartcase (core hard-codes it); `&` in a `:s` replacement is literal, `\0` is the whole match.
- `"+`/`"*` behave as "no register" (unnamed); `<C-r>+` inserts nothing.
- `H/M/L/<C-f>/<C-b>/<C-d>/<C-u>/gj/gk` operate on a virtual 30-line window anchored at line 1; `<C-e>/<C-y>/zz/zt/zb/z./z<CR>/z-` do nothing.
- The command line is append-only: `<Left>/<Right>/<Home>/<End>/<Del>/<Tab>` are counted no-ops; `<Tab>` does not complete or cancel.
- Shift+Space/Enter/Backspace/Tab/Delete/Escape/Insert are the base keys; F-keys, Meta combos, Dead/Process keys are dropped and prevented (not counted); `<C-v>` and other unbound named keys in insert mode are counted no-ops.
- Replace-mode `<BS>` moves left without restoring the replaced character, and `.`/`@q` afterwards repeat only what was typed after the last `<BS>` (adapter behaviour, inherited). Without `<BS>`, `R` repeats like vim (3.11).
- `:map`, `:set`, `:w`, `:colorscheme` families are blocked with a message; `:normal` inside `:g` is one undo step; each command inside `@q` is its own step.
- Known engine bugs ship unpatched: a macro does not abort on a failed motion (patch + upstream PR in step 2 as decided), so a recursive macro never terminates on its own; it runs until it is nested `MAX_MACRO_DEPTH` (100) deep and then throws, at the same key in every engine (before review it overflowed the stack, at a depth that differs between browsers and runs). A large count (`999@q`) still costs CPU, which step 2's server must bound. Vim state is process-global, so step 2's server must serialise replays.
- Not like vim, found in review and left as is: visual-line `c` (`Vc`) joins the changed lines with the next one, and the cursor column after `u` can differ (`ddp.ux` on `one\ntwo\nthree`).

**Fixed in the engine (stock adapter/core behaviour, found in review):** macros record and replay keys (ex commands, insert cursor keys and `<C-o>` were dropped and a played `:` prompt stayed open); `:normal` types `<…>` literally and aborts an unfinished command; `j`/`k`/`+`/`-` fail on the last/first line instead of jumping to its end/start; counted `r` fails past the end of the line; `g0`/`g^` are `0`/`^`; replace-mode cursor keys move; insert cursor keys split undo; insert `<C-w>`/`<C-u>` stop once at the insert start.

**From the spike's replayer:** `multiSelectHandleKey` instead of `handleKey` (adapter path; multiselect and notification branches); `vim.status` appended before the call; prompt keys go through the core's own handlers (the spike's `<Esc>` skipped `clearInputState`, leaving `d:` pending; `<BS>` on empty now cancels; `<C-u>`, `<Up>/<Down>`, `onKeyUp` modelled); unknown named keys in insert mode are no-ops, not literal text (the spike inserted `<C-v>` as six characters); `<BS>` is `deleteCharBackwardStrict` + `InsertModeKey` recording; replace mode overwrites; undo is group-id based (the spike relied on `newGroupDelay`); `findPosV` patch and window motions live in the engine for both sides; `<lt>` is the only spelling of `<`; global vim state is reset inside `createSession`, so the client's reset and the server's tail replay are identical; `forceParsing` after each key; ex/register/newline lockdown.

**Deferred to step 2:** server, rooms, grace timer and ranking (`graceMs`, `rankFinishers`), reconnect, Better Auth, `bun.nix` + root `postinstall`, `package.nix`, NixOS module, engine patches + upstream PR, Playwright parity suite, `InsertModeKey` recording upstreamed as a core patch (optional), happy-dom moved into `apps/server` runtime deps.

**Docs to update when the workspace lands (Worker D):** `CLAUDE.md`: reword "postinstall in each package.json" to "root package.json (one bun.nix)"; add traps: bunfig.toml is read from the cwd only (run `bun test`/`bun run` from the root), root scripts cannot call member bins under the isolated linker (`bun run --filter`), pin every `@codemirror/*` in the root catalog (two copies → "Unrecognized extension value"), never `biome migrate` (rewrites `preset` to `none`), `typescript` must stay 5.x/6.x for svelte-check 4.7.7, never call `replay()` while a live session accepts keys, `Transaction.time` in the engine is a logical undo group. `docs/decisions.md`: add the entries in `decisionsToRecord`.