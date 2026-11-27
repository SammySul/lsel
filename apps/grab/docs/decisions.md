# Decisions

## The first version (2026-11-27)

- **No login, so no stories.** Every story viewer runs logged-in accounts;
  Sammy chose to leave stories out rather than give the server an account's
  cookie, which Instagram flags and bans.
- **Public, with a limit per visitor** (from 0.3.0; it began tailnet only).
  Every new profile spends twelve's one Instagram budget, which all visitors
  share, so each may start 5 new profiles a minute; polling and cached
  profiles don't count.
- **Zips keep posts apart**: each post's files sit in a folder named for its
  date and shortcode, so a carousel stays together.
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
  too long for a blank screen. Once the profile embed and page are in, the
  server answers within 1.5 s with what has loaded and how many are pending,
  and the page asks again every 2 s. A zip uses what has loaded, waiting for
  the rest only if it names a file that hasn't, and never starts a load: that
  would get around the limit per visitor.
- **A rate limit cuts a profile short instead of failing it**: when a post is
  refused three times, what loaded is shown with a line saying how many
  didn't, and `r` loads the rest. Only a profile refused from its first post
  is an error. A refused profile page leaves the embed's six, cut short the
  same way; a page that lists no posts leaves them as they are.
- **Caching**: a post for an hour (its CDN addresses expire after days). A
  cut-short profile is kept too: dropping it when its load ended let a page
  poll arriving after start a fresh, charged load against an Instagram that was
  refusing. Identical requests in flight are merged.

## Kept longer, reloaded on demand (2026-11-27)

- **A profile stays 6 hours on the server** (it was 10 minutes). Every load
  spends the one Instagram budget all visitors share, a profile's newest twelve
  change over days, and the CDN links in it last days; R is there for anyone
  who wants it newer.
- **R asks Instagram again, past both caches**: `?reload` drops the server's
  copy and counts as a new profile, as `?retry` did; it replaces `?retry`, so
  a cut-short profile's line points at R too and there is one mechanism. The
  posts come from their own hour's cache, so only the embed and the profile page
  are asked for. Refused by the visitor's limit, it changes nothing.
- **The page keeps every profile it loaded this visit**, in memory
  (`lib/kept.ts`): switching back shows it before the server answers, then asks
  again. A whole copy is never swapped for a partial answer, so a profile the
  server has to load again stays as it was until the new one is whole: nothing
  moves, and the page's polls never show fewer posts than it had. Not
  `localStorage`: CDN links and counts would outlive the visit they were good
  for.

## The picture from Threads, the file on its own (2026-11-27)

- **The profile picture comes from Threads at 640 px**: Instagram's anonymous
  pages give only 150 px, while `threads.com/@<user>` answers without a login
  and its page's JSON lists the picture at 320 and 640 px on Instagram's CDN,
  so the media proxy serves it unchanged. It costs one more request per new
  profile (about 1 MB), asked once the profile embed is in, beside Instagram's
  queue with its own pacing, and kept with the profile for its 6 hours.
- **Threads can only fall back, never fail a profile**: no Threads profile, a
  redirect, a 429, a changed page, a picture for another username or no answer
  in 5 s keeps the embed's 150 px picture, logged. Its refusals never count as
  Instagram's, so they can't cut a profile short.
- **`o` opens the file itself in a new tab** (shown, not downloaded) and `O`
  the post on Instagram: the file at full size is what a preview is most often
  opened further for.
