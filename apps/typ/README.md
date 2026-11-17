# typ

Compare fonts side by side on your own text. Add font files (they stay in your
browser, nothing is uploaded) or, in Chromium, pick fonts installed on your
computer; type in any preview and every one follows.

## Develop

Everything runs in the Nix dev shell (`direnv allow`, or `nix develop -c …`):

```sh
bun install
bun run check        # tsc, svelte-check, biome
bun run test         # unit tests
bun run dev          # vite
bun run build        # the web app into dist/
bun run test:e2e     # dist/ in Chromium, Firefox and WebKit
```

## Configuration

| Variable               | Default               |                          |
| ---------------------- | --------------------- | ------------------------ |
| `TYP_STATIC`           | the package's web app | absolute path to `dist/` |
| `TYP_HOST`, `TYP_PORT` | `127.0.0.1`, `7200`   |                          |

A version bump in `package.json` releases it; the host that runs it follows
the release tags. The repository lives at
[git.sammysul.com/SammySul/typ](https://git.sammysul.com/SammySul/typ), where CI
runs; GitHub is a mirror.
