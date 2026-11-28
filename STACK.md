# Stack

The defaults every app starts from: `templates/web/`, a workspace member that
CI builds and tests like the apps. A new app is a copy of it in `apps/<name>/`
(README.md).

| Concern                  | Default                                                                       | Why                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment              | Nix flake dev shell, direnv                                                   | The same toolchain locally, in CI and on `twelve`; pins Bun, Biome and browsers                                                                                                                                |
| Build, checks, release   | lsel's flake (`nix/app.nix`, `lsel-release`), one Bun workspace               | One build, its checks and the release for every app; the kit and the apps change in one commit                                                                                                                 |
| Runtime, packages, tests | Bun                                                                           | One tool for install, run, test and `bun patch`                                                                                                                                                                |
| Language                 | TypeScript, strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | The kit's `config/tsconfig.json`, which every app extends                                                                                                                                                      |
| Lint, format             | Biome, `recommended` preset, one root config                                  | Fast, one tool; never run `biome migrate` (it switches the linter off)                                                                                                                                         |
| Interface                | Svelte 5 + Vite, single page                                                  | Small, no framework server. Several screens are `#/…` routes in the app (yank-wars). SvelteKit only when pages must render on the server: indexed content, a link preview per page, working without JavaScript |
| Games                    | A 2D canvas inside the Svelte shell                                           | The shell keeps keyboard, focus and layout consistent with the rest                                                                                                                                            |
| Validation               | Valibot, only where outside data enters                                       | Inside the boundary, trust the types                                                                                                                                                                           |
| Data                     | Content as files, state in `bun:sqlite`                                       | One file in the service's state directory, backed up by `squares`                                                                                                                                              |
| Server                   | `serve()` from `@sammysul/lsel/server` (Bun.serve, no framework)              | Static files, `/healthz`, strict CSP, loopback only; the app adds its routes                                                                                                                                   |
| Unit tests               | `bun --conditions=browser test`, the kit's preload                            | Call code as its users do, assert literal values; the condition and preload let Svelte compile in tests                                                                                                        |
| Browser tests            | Playwright with the dev shell's browsers                                      | Chromium only (`BROWSERS=chromium` in `test:e2e`) until an app has code for a Firefox or WebKit quirk; then all three, or that code goes untested                                                              |
| Interface pieces         | `@sammysul/lsel` (`kit/`)                                                     | The frame, keys, states, formats and preferences, once; `lsel-check` fails an app that rolls its own                                                                                                           |
| Players and dailies      | `@sammysul/lsel`: `server/accounts`, `server/board`, `daily`                  | Guests with GitHub sign-in (Better Auth), board names, a daily calendar and its board, as yank-wars and antenna share them                                                                                     |
| Styling                  | `tokens.css` from `@sammysul/lsel`                                            | `DESIGN.md`                                                                                                                                                                                                    |

## Patterns

- **One process** serves the built web app and its API (`Bun.serve`); no
  separate web server or container per part.
- **One request per screen**: the API answers with everything a view needs,
  rather than the client stitching several calls together.
- **Validate what comes in** from outside (an upstream API, a file, a socket)
  with Valibot at that edge, so a change upstream fails loudly instead of
  turning into zeros.
- **Cache by how data changes**: immutable upstream data (a finished match) in
  `bun:sqlite`, kept across restarts; data that moves (recent stats) in memory
  with a TTL; merge identical requests already in flight.
- **Show upstream failures**: a rate limit or outage is a message on screen,
  never an empty table.
- **A slow upstream answers in parts**: the API returns what it has within a
  second or two with how much is still coming, and the page asks again until
  nothing is (grab's `snapshot()` and `pending`).

## Code

How an app's code is laid out, so the next one reads like the last. Each names
the file that shows it; copy that shape rather than inventing one. `templates/web`
starts with it: `config.ts`, `api.ts`, `main.ts`, `src/shared/` and a
`resource()` view with its `Status`.

- **Server files**: `main.ts` starts `serve()` and only wires;
  `config.ts`, when the app has settings of its own, holds them (its default
  port, the Valibot schema of an environment beyond host and port); `api.ts`
  is the routes, taking its upstream as a dependency; one client per upstream
  (`pubg.ts`, `instagram.ts`). dajaj's `src/server/`.
- **An upstream's failures** are one error class with a `kind`, mapped to an
  HTTP status in one table, its message written for the screen (`PubgError`
  and `STATUS` in dajaj's `pubg.ts` and `api.ts`).
- **A fake upstream for tests**, in the upstream's real shape, served or
  injected as `fetch` (`fakePubg.ts`, `fakeInstagram.ts`): unit and browser
  tests run against it, never the real one. Nothing `main.ts` imports may
  import it, or it ships in the binary.
- **The web app**: `main.ts` calls the kit's `start(App)` (with `{ props }`
  for what only `main.ts` knows, lsel-station's `readOnly`); data comes through
  `resource()` with a `Status` per view, from the app's own API through
  `getJson()`, which turns each failure into a sentence for the `Status`; a view that shows one thing (a
  profile, a puzzle) is keyed on it, so the last answer never stands in for
  another's (grab's `ProfileView`). Saved choices live in one `prefs.ts`
  with `persisted()` (dajaj's).
- **Shared types** between server and page sit in `src/shared/`; the page
  never imports from `src/server/`.
- **Tests** call the code as its users do and assert literal values; a test
  that would pass with every import returning `undefined` is deleted. Every
  app's browser tests check `lselLook()` and `lselLayout()`.

## Release

1. `version` in an app's `package.json` is its only version.
2. Pushing `main` runs CI on twelve's Forgejo runner (`.forgejo/workflows/ci.yml`,
   `runs-on: self-hosted`, the host's Nix): `nix flake check` builds every app
   and runs each one's `bun run check` and `test` (an app nothing touched is a
   cache hit); the browser tests run in the dev shell, for the members changed
   since the last green run (`nix/touched.sh`; every member when the kit, the
   theme, Nix or the lockfile's dependencies changed). Then `lsel-release` turns
   each app version without its `<name>-v<version>` tag into a Forgejo release
   listing the commit subjects under that app since its last tag; any other
   push releases nothing. GitHub mirrors the repository, with no workflows
   there.
3. On `twelve`, the app's updater (`squares`, `hosts/twelve/apps.nix`: one
   module for every app) sees the new tag within 5 minutes, builds it, restarts
   only that service and rolls back if `/healthz` fails. A tag that fails is
   never retried: fix forward with a new version.

## Deploy (a new service)

The app ships only its package (an entry in `flake.nix`'s `apps`). The
server reads `<PREFIX>_HOST` and `<PREFIX>_PORT` and answers `ok` on `/healthz`;
the prefix is `package.json`'s `name` in capitals, `-` as `_`.
Then in `squares`:

1. `twelve.apps.<name>` in `hosts/twelve/native.nix` with a free loopback port
   and its `envPrefix` (`state = true` for a `/var/lib/<name>`), and the app in
   `hosts/twelve/apps-test.nix`.
2. An `ingress."<domain>"` line on the existing cloudflared tunnel, then the DNS
   record (`cloudflared tunnel route dns`, see the trap in `CLAUDE.md`).
3. Its state directory in the nightly restic paths, or `stateIgnored` with the
   reason: `squares` refuses to build otherwise.
4. Build `twelve` on `twelve` without switching, read `nix store
   diff-closures` against the running system, then `deploy`.

Domains live on Cloudflare in the tunnel's account; a `.app` domain is
HTTPS-only (HSTS preload), which the tunnel provides.
