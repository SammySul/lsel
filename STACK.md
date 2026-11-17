# Stack

The defaults every project starts from (`nix flake init -t ../..#web` from a
new `projects/<name>/`). yank-wars is the reference implementation for all of
it.

| Concern | Default | Why |
|---|---|---|
| Environment | Nix flake dev shell, direnv | The same toolchain locally, in CI and on `twelve`; pins Bun, Biome and browsers |
| Runtime, packages, tests | Bun | One tool for install, run, test and `bun patch` |
| Language | TypeScript, strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | The template's `tsconfig.json` |
| Lint, format | Biome, `recommended` preset | Fast, one tool; never run `biome migrate` (it switches the linter off) |
| Interface | Svelte 5 + Vite, single page | Small, no framework server; SvelteKit only if server rendering is needed |
| Games | A 2D canvas inside the Svelte shell | The shell keeps keyboard, focus and layout consistent with the rest |
| Validation | Valibot, only where outside data enters | Inside the boundary, trust the types |
| Data | Content as files, state in `bun:sqlite` | One file in the service's state directory, backed up by `squares` |
| Server | `Bun.serve`, no framework | Static files, `/healthz`, strict CSP, loopback only |
| Unit tests | `bun test` | Call code as its users do, assert literal values |
| Browser tests | Playwright with the dev shell's browsers | Real-browser checks in Chromium, Firefox and WebKit |
| Styling | `tokens.css` from lsel | `DESIGN.md` |

## Release

1. `version` in the root `package.json` is the only version.
2. Pushing `main` runs CI (`nix develop -c …` for every step). A version
   without its `v<version>` tag becomes a GitHub release listing the commit
   subjects since the last tag; any other push releases nothing.
3. On `twelve`, the project's updater sees the new tag within 5 minutes, builds
   it, restarts only that service and rolls back if `/healthz` fails. A tag
   that fails is never retried: fix forward with a new version.

## Deploy (a new service)

Copy yank-wars' `nix/package.nix` and `nix/module.nix` (with `autoUpdate`),
then in `squares`:

1. A flake input `github:SammySul/<name>` following `nixpkgs-twelve`, and its
   `nixosModules.default` in `hosts/twelve/default.nix`.
2. `services.<name>` with a free loopback port and `autoUpdate.repo`.
3. An `ingress."<domain>"` line on the existing cloudflared tunnel, then the DNS
   record (`cloudflared tunnel route dns`, see the trap in `CLAUDE.md`).
4. Its state directory in the nightly restic paths, or `stateIgnored` with the
   reason: `squares` refuses to build otherwise.
5. Build `twelve` on `twelve` without switching, read `nix store
   diff-closures` against the running system, then `deploy`.

Domains live on Cloudflare in the tunnel's account; a `.app` domain is
HTTPS-only (HSTS preload), which the tunnel provides.
