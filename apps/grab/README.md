# grab

A public Instagram profile's picture and newest posts, to preview and
download: one file at a time, or the ticked ones as a zip. No login, so it
sees what a logged-out visitor sees: the newest 12 posts (every carousel item
and reel video in them at full size) and a 150 px profile picture. No
stories, no private accounts.

## Develop

Everything runs in the Nix dev shell (`direnv allow`, or `nix develop -c …`):

```sh
bun install
bun run check        # tsc, svelte-check, lsel-check
bun run test         # unit tests, Instagram faked
bun run build        # the web app into dist/
bun run test:e2e     # dist/ in Chromium, Instagram faked
```

Against Instagram, the server and the web app beside it:

```sh
GRAB_STATIC=$PWD/dist bun src/server/main.ts
bun run dev          # vite, proxying /api to the server
```

## Configuration

| Variable                 | Default               |                          |
| ------------------------ | --------------------- | ------------------------ |
| `GRAB_STATIC`            | the package's web app | absolute path to `dist/` |
| `GRAB_HOST`, `GRAB_PORT` | `127.0.0.1`, `7340`   |                          |

It runs at grab.sammysul.com. Each visitor may start 5 new profiles a minute:
every profile spends the server's one Instagram budget, which all share.
