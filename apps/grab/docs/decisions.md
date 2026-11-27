# Decisions

## The first version (2026-11-27)

- **No login, so no stories.** Every story viewer runs logged-in accounts;
  Sammy chose to leave stories out rather than give the server an account's
  cookie, which Instagram flags and bans.
- **Tailnet only.** Scraping breaks Instagram's terms; a public site would
  invite takedowns and have strangers spend the server's rate limit.
- **Three public pages, no API.** On Nov 27, 2026 the anonymous
  `web_profile_info` (www and `i.`) answered 404 and the post GraphQL query
  401. The profile page lists the newest 12 (pinned first), the profile embed
  gives the counts, the 150 px picture and dates for the newest six, and each
  post's embed gives its full-size images, video and carousel items. Nothing
  anonymous pages further back.
- **Files go through the server**: the CSP allows only `'self'`, and
  Instagram's CDN wouldn't let another site embed them anyway. The proxy
  passes `Range`, so videos seek.
- **The zip is built as it streams**, stored, not deflated (photos and videos
  don't shrink), four files fetched ahead. A file the CDN refuses is named in
  `MISSING.txt` instead of breaking a download already under way.
- **A request a second, one at a time, a refused one asked again after 5 s**
  (three tries). Four post embeds at once tripped the rate limit within a
  dozen requests, and refusals turned out to be chance, not a block: every
  page refused once loaded on its second try.
- **The page fills in as posts arrive**: a cold profile took 26 to 51 s live,
  too long for a blank screen. The server answers within 1.5 s with what has
  loaded and how many are pending, and the page asks again every 2 s. A zip
  uses what has loaded, waiting for the rest only if it names a file that
  hasn't.
- **A rate limit cuts a profile short instead of failing it**: when a post is
  refused three times, what loaded is shown with a line saying how many
  didn't, and `r` loads the rest. Only a profile refused from its first post
  is an error.
- **Caching**: a whole profile for 10 minutes, a post for an hour (its CDN
  addresses expire after days); a cut-short profile isn't kept, so a retry asks
  only for the posts it lacks. Identical requests in flight are merged.
