# @yank-wars/web

The client: puzzle list, solo rounds, rooms, split view with live diff. Run everything from
`apps/yank-wars` (`bunfig.toml` is read from the cwd only):

```sh
bun run dev     # vite dev server; DEV build, so the result card shows the self-check badge
YW_STATIC=$PWD/web/dist bun server/src/main.ts   # the rooms, for dev: vite proxies /ws to it
bun run build   # production build into web/dist
bun run check   # tsc (engine, server), svelte-check (web), lsel-check
```

## Browser tests

Playwright drives the DEV server in Chromium, Firefox and WebKit. They need the dev shell's
browsers and are not part of plain `bun test` (the files end in `.e2e.ts`):

```sh
nix develop -c bun run test:e2e                     # all three; CI sets YW_SAMPLE=all
nix develop -c bun test ./web/e2e/flow.e2e.ts       # the real app, list to result card
nix develop -c bun test ./web/e2e/parity.e2e.ts     # oracle cases: live == replay of the log
nix develop -c bun test ./web/e2e/room.e2e.ts       # two players in a room, a reload mid-round
nix develop -c bun test ./web/e2e/built.e2e.ts      # the production build behind the server's CSP
```

`built.e2e.ts` needs `bun run build` first. `parity.e2e.ts` reads `BROWSERS`, `ORACLE_CATEGORY`,
`ORACLE_CASE`, `YW_SAMPLE` (default 40, or `all`), `YW_SEED` and `YW_CLOCK_SAMPLE`.

## Still manual

Playwright sends synthetic events through each browser's protocol, so these still need a person:

- On a German layout, `{` (AltGr+7 on Windows, Option+8 on macOS) types `{`.
- A dead key on a real US-International layout and a real IME show the hint and insert nothing.
- Holding a key repeats it, and every repeat counts as one key.
- Windows/Linux Chrome: the insert-mode status line shows the Ctrl+W hint.
- The result card's `c` in a stock Firefox and Safari (headless Firefox and WebKit may refuse
  clipboard writes, so the suite only checks the button reports one outcome there).
- A stock Firefox and Safari behave like Playwright's builds (the suites run patched ones).
- HMR: editing a component under `bun run dev` updates the page without a full reload.
- A room between two machines through the tunnel: Cloudflare carries the WebSocket, and a
  phone-tethered or flaky connection reconnects.
