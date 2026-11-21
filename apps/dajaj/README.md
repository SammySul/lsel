# dajaj

PUBG stats for a group of friends: the matches all of you played recently,
as a table or a bar, line or pie chart.

## Develop

Everything runs in the Nix dev shell (`direnv allow`, or `nix develop -c …`):

```sh
bun install
bun run check        # tsc, svelte-check, lsel-check
bun run test         # unit tests, PUBG faked
bun run build        # the web app into dist/
bun run test:e2e     # dist/ in Chromium, PUBG faked
```

To run it against PUBG, start the server with a key and the players, and the
web app beside it:

```sh
DAJAJ_STATIC=$PWD/dist DAJAJ_DB=$PWD/cache.sqlite DAJAJ_PLAYERS=AntennaTower,Rectifier94 \
  PUBG_API_KEY=... bun src/server/main.ts
bun run dev          # vite, proxying /api to the server
```

## Configuration

| Variable                   | Default                             |                                           |
| -------------------------- | ----------------------------------- | ----------------------------------------- |
| `DAJAJ_PLAYERS`            |                                     | comma-separated PUBG names, at most 10    |
| `PUBG_API_KEY`             |                                     | from developer.pubg.com                   |
| `DAJAJ_STATIC`             | the package's web app               | absolute path to `dist/`                  |
| `DAJAJ_DB`                 |                                     | absolute path to the match cache (SQLite) |
| `DAJAJ_HOST`, `DAJAJ_PORT` | `127.0.0.1`, `7310`                 |                                           |
| `PUBG_API_URL`             | `https://api.pubg.com/shards/steam` |                                           |

A version bump in `package.json` releases it; the host that runs it follows
the release tags.
