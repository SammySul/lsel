# dajaj

Shared rules come from lsel's `CLAUDE.md`; this file holds only this project's
traps. The why behind the design: `docs/decisions.md`.

- **PUBG allows 10 keyed requests a minute.** The player lookup and each
  player's lifetime stats count; matches don't. Keep `Pubg`'s caches when
  changing it, or a refresh with five players already spends six.
- Player names are case-sensitive at PUBG and in `DAJAJ_PLAYERS`.
- Chart.js sets its styles through the DOM, which the CSP allows.
