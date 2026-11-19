# lsel

The home base. Every project lives in `projects/<name>/` (its own repo, ignored
here), so Claude Code reads this file in all of them; each project's own
`CLAUDE.md` adds only its traps. Look and feel: `DESIGN.md`. Stack and deploy:
`STACK.md`. Deviating from either needs Sammy's yes.

## What a CLAUDE.md is for

Only traps: something that already went wrong, or would, and that neither the
code nor upstream's docs make obvious. One or two lines each, with the why. No
descriptions of what code does, no history. When you touch something a note
describes, fix or delete the note.

## Working here

- **Nix dev shell per project** (`direnv allow`, or `nix develop -c …`);
  nothing is installed globally. **Bun only** for install, test, run and
  `bun patch`; no npm, no npx.
- **Validate before calling it done**, with the project's own check, test and
  build scripts, and say plainly what is untested, especially anything checked
  only headless or only on one OS.
- **Comments: one line or none**, only for a why the code can't show.
- **Commits: subject line only.** No body, no trailers. Signed with the
  personal SSH key, author `Sammy Suleiman <mail@sammysul.com>`; every repo lives
  on Forgejo (`forgejo:SammySul/<name>.git`, git.sammysul.com); public ones are mirrored
  to `github.com/SammySul/<name>` by Forgejo's push mirror, MIT, `Copyright (c) <year> SammySul`. A repo
  goes public only with a history free of older names and emails (fresh, or
  rewritten), since a public history can't be taken back. Set the mirror up
  yourself with the keychain's tokens (`security find-generic-password -s <item>
  -w`, never printed): `github-mirror` creates the GitHub repo (all SammySul
  repos, administration and contents), `forgejo` adds the push mirror
  (repository read/write).
- **Specs are deleted once built**; `docs/decisions.md` keeps the why.
- **When Sammy has to act** (a login, `sudo`, a dashboard), one step per
  message, then wait.
- **US spelling and a 12-hour clock**; metric units and Celsius are the only
  exceptions. No toggles for the alternatives.

## Traps

- **The palette** (`theme/palettes.nix`) feeds the terminal, nvim and desktop
  through `squares` as well as every project: all 16 `term` slots must be
  filled, and `base` sits below Moon's own base, which stays as `raise`, or the
  ramp skips a step. `squares` follows with `nix flake update lsel`.
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
- **Playwright with Nix's browsers:** `playwright-core` must equal the dev
  shell's `PLAYWRIGHT_DRIVER_VERSION`. Off NixOS (e.g. a hosted Ubuntu runner) set
  `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` (its ldconfig check can't see
  Nix's libraries) and, on Linux, `__EGL_VENDOR_LIBRARY_DIRS` to
  `${pkgs.mesa}/share/glvnd/egl_vendor.d`, or WebKit dies opening a page.
- Firefox logs "scroll-linked positioning effect" once per page whenever a
  scroll handler moves content: a test that fails on console warnings must
  ignore exactly that one.
- **bun2nix 2.1.2 rejects bun ≥ 1.3's lockfile** ("Unsupported lockfile
  version"): the templates' `flake.nix` applies `nix/bun2nix-lockfile-v2.patch`
  until a release has upstream PR #110; then drop it there and run `bun run sync`.
- **The Nix build aliases bun's cache path for `@sammysul`'s registry**
  (`384c46f8dbebcd65`, the Wyhash11 of its URL, in the synced
  `nix/bun-cache-alias.sh`): bun2nix 2.1.2 leaves the hash out for a registry
  with a path. Moving the registry needs a new hash, until bun2nix handles it
  (draft PR #103).
- **Publish a kit version before a project pins it**: CI publishes on push to
  lsel's `main`, and `bun add @sammysul/lsel@<version> --exact` (not `bun
  update`: the pin is exact) fails until then.
- **A path in a project's `lsel.json` `files` is the template's file**: edit it
  in `templates/` and `bun run sync <project>`, or the next sync overwrites the edit. A
  project that must differ drops the path from its list.
- **The CSP is `default-src 'self'` with no inline styles**: an inline `<style>`
  in `index.html` or a `style` attribute string breaks the page. Svelte's
  `style:` directive and anything set through the DOM is allowed. A project that
  needs more (CodeMirror's injected styles) passes `serve({ csp })`, which adds
  to the policy.
- Vite's root is `src/web`, so `public/` and `index.html` live there; the build
  lands in `dist/` at the repo root, which `bun run test:e2e` needs first.
- **Extension icons reach `dist/` only through Vite's `public/`**:
  vite-plugin-web-extension does not copy the files the manifest names.
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
