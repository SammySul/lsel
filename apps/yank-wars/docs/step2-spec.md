# Step 2 spec

## 0. Status (2026-11-16)

Part 1 is built and its VM test passes; the deploy (1.4) waits for a go-ahead.
Parts 2 and 3 are outlines, specified in full before each starts. Build order
and rationale: `docs/decisions.md`.

| Part | Goal | State |
|---|---|---|
| 1. Package and deploy | `https://yankwars.app` serves today's solo game from `twelve`, built by this flake | built; deploy pending |
| 2. Rooms | two players race over an invite link; the server replays and judges | outline |
| 3. Identity and records | anonymous sessions, rejected lock-ins stored | outline |

Settled for part 1: the `yankwars.app` zone is on Cloudflare in the tunnel's
account; the port is `7300` on loopback (`typ` is 7200).

## 1. Package and deploy

Done when the solo game is live at `https://yankwars.app`, built and deployed by
Nix like `lsel`, with nothing new in `squares` beyond an input, an import, a
`services.yank-wars` block and one tunnel ingress line.

### 1.1 Server: `apps/server`

`@yank-wars/server`, entry `src/main.ts`, `Bun.serve` with no framework.

- `GET /healthz` → `200 ok`, for the module test and monitoring.
- Static files from `YW_STATIC` (the built `apps/web/dist`). Routes are hash
  based (`#/p/<id>`), so there is no SPA fallback: `/` serves `index.html`,
  anything else not on disk is `404`. Paths are resolved inside `YW_STATIC`
  and a request that escapes it (`..`, encoded or not) is `404`.
- Cache: `/assets/*` (content-hashed by Vite) `public, max-age=31536000,
  immutable`; `index.html` `no-cache`.
- Headers on every response: a CSP of `default-src 'self'`, `style-src 'self'
  'unsafe-inline'` (CodeMirror injects `<style>` at runtime), `connect-src
  'self'` (same-origin `wss:` in part 2); `X-Content-Type-Options: nosniff`;
  `Referrer-Policy: no-referrer`. No HSTS header: `.app` is preloaded.
- Binds `YW_HOST` (default `127.0.0.1`) and `YW_PORT` (default `7300`); config
  is parsed once at start with Valibot and a bad value exits non-zero.
- Tests (`bun test`, a server on port 0 against a temp dir): `/`, an asset and
  its cache header, `404` for unknown and traversal paths, `/healthz`, headers.

### 1.2 Package: `nix/package.nix` → `packages.<system>.default`

One `bun2nix.mkDerivation` over the workspace root: `bun.nix` from the root
`bun.lock`, `patches/` applied through `patchedDependenciesToOverrides` (as in
the spike), `dontRunLifecycleScripts`. It runs `bun run build`, compiles
`apps/server/src/main.ts` to one binary, and installs `$out/bin/yank-wars`
(wrapped with `YW_STATIC`) and `$out/share/yank-wars/web`.

- Root `package.json` gets `"postinstall": "bun2nix -o bun.nix"`; the root
  `bun.nix` is committed. CLAUDE.md's note "only the spike has one" is updated.
- **First task, highest risk:** the spike proved bun2nix on one package; a
  workspace with the isolated linker and a `catalog` is unproven. If
  `nix build` can't install the workspace, the fallback is building the web
  dist in its own derivation, not changing the linker (the isolated linker is
  what makes `apps/web`'s missing editing packages fail to import).
- Builds on `aarch64-darwin` (dev) and `x86_64-linux` (`twelve`).

### 1.3 Module: `nix/module.nix` → `nixosModules.default`

`services.yank-wars`: `enable`, `package` (`mkDefault` this flake's package, as
`lsel` does), `host` (`127.0.0.1`), `port` (`7300`).

- systemd service: `DynamicUser`, `StateDirectory=yank-wars` (the sqlite file
  in part 3), `Restart=on-failure`, and the usual hardening (`ProtectSystem=
  strict`, `ProtectHome`, `PrivateTmp`, `NoNewPrivileges`,
  `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`), but not
  `MemoryDenyWriteExecute`: Bun's JIT needs writable executable memory.
- `checks.x86_64-linux.module`: a NixOS VM test that starts the service and
  curls `/healthz` and `/`. Runs on `twelve` (the mac has no Linux builder).

### 1.4 Deploy: `squares`

- Input `yank-wars = git+ssh://twelve-ts/srv/git/yank-wars.git`, following
  `nixpkgs-twelve` like `lsel`; `inputs.yank-wars.nixosModules.default` in
  `hosts/twelve/default.nix`.
- `hosts/twelve/native.nix`: `services.yank-wars.enable = true;` and
  `ingress."yankwars.app" = "http://localhost:7300";` on the existing tunnel.
- `hosts/twelve/services.nix`: `/var/lib/private/yank-wars` in the nightly
  restic paths; `squares` asserts every state directory is backed up or
  explicitly ignored.
- DNS: `cloudflared tunnel route dns <tunnel> yankwars.app` once (open point 1).
- Deploy is asked for separately when the module test passes; Claude edits
  `squares` but does not switch `twelve` unasked.

### 1.5 Acceptance

`bun run check`, `bun test` (with the server tests), `nix build .#default` on
both systems, the module VM test on `twelve`, then on the live site: a puzzle
played to lock-in in Chrome, Firefox and Safari, `/assets/*` immutable and
`index.html` `no-cache` in the response headers.

Out of scope: WebSockets, rooms, auth, CI on GitHub (the repo has no GitHub
remote yet).

## 2. Rooms (outline)

Specified before it starts; decisions already made are in `docs/decisions.md`
(Round rules, Architecture).

- Invite link `#/r/<id>`; a room is a series with rematch in place.
- Protocol types and Valibot schemas in `engine`, versioned: join, ready, keys
  (with reset markers), progress, lock-in claim, grace start, result.
- The server owns time: lock-in and grace deadlines use receive time; round
  cap 4 minutes; 15 s to reconnect, then forfeit.
- Replay of the scored tail on each lock-in claim. Vim state is
  process-global, so replays are serialised; to decide here: a queue on the
  main thread or one replay worker (happy-dom in a `Worker`) so a slow replay
  can't stall the sockets. Bound macro counts (`999@q`).
- Mismatch handling: a rejected lock-in keeps the player in the round and logs
  key log, puzzle and both buffers.
- Open: grace timer length, what the opponent sees live (key count, lines off,
  nothing).

## 3. Identity and records (outline)

- Better Auth with the anonymous plugin, `bun:sqlite` in the state directory.
  `squares` backs up `/var/lib/private/yank-wars` nightly with restic, which
  copies files as they are: write a consistent snapshot first (`VACUUM INTO`
  or the `-predump` convention in `squares`), never rely on the live file.
- Rejected lock-ins and finished rounds stored; the upstream PRs for the core
  patch go out alongside.
