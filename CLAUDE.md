# lsel

The home base and the one repo for the kit and every app (`apps/<name>/`), so
Claude Code reads this file in all of them; each app's own `CLAUDE.md` adds only
its traps. Look and feel: `DESIGN.md`. Stack and deploy:
`STACK.md`. Deviating from either needs Sammy's yes.

## What a CLAUDE.md is for

Only traps: something that already went wrong, or would, and that neither the
code nor upstream's docs make obvious. One or two lines each, with the why. No
descriptions of what code does, no history. When you touch something a note
describes, fix or delete the note.

## Working here

- **One Nix dev shell, the root's** (`direnv allow`, or `nix develop -c …`);
  nothing is installed globally. **Bun only** for install, test, run and
  `bun patch`; no npm, no npx.
- **Validate before calling it done**: `nix flake check`, then the root's
  `bun run build` and `test:e2e` (each runs in every member), and say plainly
  what is untested, especially anything checked only headless or only on one OS.
- **Comments: one line or none**, only for a why the code can't show; the
  exception is line 1 of every non-test source file, which says what the file
  is for (lsel-check enforces it, and a file over 400 lines).
- **Commits: subject line only.** No body, no trailers. Signed with the
  personal SSH key, author `Sammy Suleiman <mail@sammysul.com>`. lsel lives on
  Forgejo (`forgejo:SammySul/lsel.git`, git.sammysul.com), mirrored to GitHub by
  Forgejo's push mirror; MIT, `Copyright (c) <year> SammySul`.
- **A repo goes public only with a history free of older names and emails**
  (fresh, or rewritten): a public history can't be taken back. The keychain's
  tokens (`security find-generic-password -s <item> -w`, never printed):
  `github-mirror` for GitHub (all SammySul repos, administration and contents),
  `forgejo` for Forgejo (repository read/write).
- **Specs are deleted once built**; `docs/decisions.md` keeps the why.
- **Read `DESIGN.md` before UI work and `STACK.md` before code**, then copy
  the files they point to. A convention (a fix every app should follow) lands
  in them in the same commit, with a check where one can catch it
  (`lsel-check`, `lselLayout()`): a rule only in a commit message is lost.
- **When Sammy has to act** (a login, `sudo`, a dashboard), one step per
  message, then wait.
- **US spelling and a 12-hour clock**; metric units and Celsius are the only
  exceptions. No toggles for the alternatives.

## Traps

- **The palette** (`theme/palette.nix`) feeds the terminal, nvim and desktop
  through `squares` as well as every app: all 16 `term` slots must be filled,
  and `squares` follows with `nix flake update lsel`.
- **Subset fonts with `--recalc-bounds`**: DejaVu ships stale glyph bounding
  boxes, Firefox logs a warning per glyph, and every look test fails on it.
- A flake sees only git-tracked files: `git add` new files before `nix build`
  or `nix develop`, or it fails with "does not exist in Git repository".
- zsh doesn't split `$var` into words: a variable holding several paths is one
  argument. Spell the paths out.
- In `squares`, stage files by path and check `git diff --cached --stat`
  before committing: other sessions edit it concurrently, and `git add -A` once
  shipped someone's unfinished work.
- Package scripts put `node_modules/.bin` first on PATH: after dropping a
  dependency that shipped a binary, `rm -rf node_modules`, or the stale copy
  keeps running instead of the dev shell's.
- **Playwright with Nix's browsers:** `playwright-core` in the root catalog must
  equal the dev shell's `PLAYWRIGHT_DRIVER_VERSION`. The rest of the shell's
  environment must come along to any other shell or runner, or the host check
  fails and, on Linux, WebKit dies opening a page.
- **Build with lsel's bun2nix, never nixpkgs' or upstream's**: 2.1.2
  rejects bun ≥ 1.3's lockfile (patched until a release has PR #110).
- **Run `bun install` after changing a dependency or the palette**, in the dev
  shell: its `postinstall` rewrites `bun.nix`, which the Nix build reads, and
  `kit/src/lib/assets`, which the kit exports from source.
- **A version every member uses goes in the root `catalog`**, written
  `"catalog:"` in the member: a second copy of `svelte` or `@codemirror/state`
  breaks at runtime. `patchedDependencies` lives only in the root, its patches
  in `patches/`.
- **Run an app's scripts in its directory** (the root's `--filter` scripts do):
  bun reads `bunfig.toml`, and with it the tests' preload, from the cwd only.
- **bun ignores `timeout` in `bunfig.toml`**: the kit's test preload sets 20 s
  for every member; a member whose bunfig drops that preload loses it, and a
  timed-out test has bun kill the browser for every later test in the file.
- **Biome formats Markdown too**: after editing a doc, `biome format --write`
  it, or `nix flake check` fails on its tables and line breaks.
- **An app is built, checked and deployable only once it's in `flake.nix`'s
  `apps`**; CI releases every `apps/*` whose version has no `<name>-v` tag.
- **CI runs browser tests only for the members a push changed**
  (`nix/touched.sh`): a new shared path the apps' tests depend on goes in its
  every-member list, or a change there is never browser-tested.
- **Better Auth limits sign-ins per address** (`cf-connecting-ip`): a test with
  several browsers or devices gives each its own address, or the third sign-in
  in 10 s gets a 429.
- **The CSP is `default-src 'self'` with no inline styles**: an inline `<style>`
  in `index.html` or a `style` attribute string breaks the page. Svelte's
  `style:` directive and anything set through the DOM is allowed. An app that
  needs more (CodeMirror's injected styles) passes `serve({ csp })`, which adds
  to the policy.
- Vite's root is `src/web`, so `public/` and `index.html` live there; the build
  lands in the app's `dist/`, which `bun run test:e2e` needs first.
- `cloudflared tunnel route dns` writes into the zone its cert was issued for;
  for any other zone it silently creates `<host>.<that zone>`. The certs are
  `~/.cloudflared/cert-<zone>.pem` (one per zone; `ls ~/.cloudflared`):
  pass the right one with `--origincert`. A new zone needs `cloudflared tunnel
  login` (it writes `cert.pem`; rename it after).
- Cloudflare's login check rejects the Mac's Proton exit address (via `twelve`):
  sign in from another device instead.
- **Forgejo's API** has run status (`/api/v1/repos/<owner>/<repo>/actions/tasks`)
  but no job logs: read them as `ssh forgejo@twelve` from
  `/var/lib/forgejo/data/actions_log/<owner>/<repo>/*/<task>.log.zst` (`zstd -dc`).
  A `write:repository` token can't delete a repo: do that in the web UI.
- `tailscale serve` settings live in tailscaled, not in Nix: removing a service
  from `squares` leaves its `serve` running until `sudo tailscale serve
  --https=<port> off`.
