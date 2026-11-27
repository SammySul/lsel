# Decisions

## The lsel port (2026-11-17)

dajaj was an Angular 20 app with Material and Transloco, a NestJS proxy to
PUBG's API, and two Docker images. It is now one Bun process on the lsel stack
(`STACK.md` in lsel): a Svelte page and a `Bun.serve` API, packaged with Nix and
deployed by the tag-following updater, like yank-wars. Its history starts here;
the Angular version stays in the private repo on `twelve`.

What changed on the way, and why:

- **Shared matches are every match all selected players were in.** The old
  code built the set with `new Set(...lists)`, which reads only the first
  player's list, so a match only another player's recent list had was dropped.
- **One request per screen**: `/api/report` returns the totals and every match,
  so the table and all charts come from one call instead of two.
- **Caching follows how the data changes**: players per name for a day (the old
  cache refetched everyone when one new name was asked for), recent matches per
  player for 20 minutes, finished matches in SQLite for good, so a restart
  never refetches them. Identical requests in flight are merged.
- **PUBG's failures reach the page**: a rate limit, an outage or a changed
  response is a message, where the old app showed an empty table. Responses
  are validated with Valibot, so a changed field names itself.
- **Players come from the NixOS module**; only the API key is secret, in an
  environment file systemd reads.
- **Units people read**: distances in km, time survived as h:mm, US 12-hour
  dates on the line chart's axis. English only (the Arabic translation went
  with Transloco); the doughnut/pie toggle is gone.
- **The screen holds still** (lsel's Layout rules): the players arrive after the
  page draws, so they keep a one-line row, a control high, cut at the edge
  rather than wrapping or scrolling sideways; the table or chart fills a frame
  that takes the height left, so a report arriving never moves the footer.
- **Charts stay Chart.js**, recolored with the terminal palette; they animate
  to new values, except under reduced motion.

Not done, to verify first: PUBG's player lookup may list each player's recent
matches itself, which would replace the per-player lifetime call and its rate
limit cost. Check against the real API before relying on it.
