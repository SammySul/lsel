# dajaj

Shared rules come from lsel's `CLAUDE.md`; this file holds only this project's
traps. The why behind the design: `docs/decisions.md`.

- **PUBG allows 10 keyed requests a minute.** The player lookup and each
  player's lifetime stats count; matches don't. Keep `Pubg`'s caches when
  changing it, or a refresh with five players already spends six.
- Player names are case-sensitive at PUBG and in `DAJAJ_PLAYERS`.
- `src/server/fakePubg.ts` is for tests only: nothing `main.ts` imports may
  import it, or it ships in the binary.
- Vite's root is `src/web`, so its `public/` and `index.html` live there; the
  build lands in `dist/` at the repo root, which `bun run test:e2e` needs first.
- The page's CSP is `default-src 'self'` with no inline styles: an inline
  `<style>` in `index.html` or a style attribute in markup breaks it (Chart.js
  and Svelte set styles through the DOM, which the CSP allows).
