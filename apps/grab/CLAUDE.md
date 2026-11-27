# grab

Shared rules come from lsel's `CLAUDE.md`; this file holds only this project's
traps. The why behind the design: `docs/decisions.md`.

- **Only three Instagram pages answer without a login** (checked Nov 27,
  2026): the profile embed (`/<user>/embed/`), the profile page (`/<user>/`,
  only with `Sec-Fetch-*` navigation headers, or it redirects to the login) and
  the post embed (`/p/<code>/embed/captioned/`). `web_profile_info` and the
  GraphQL `doc_id` queries answer 404 or 401. When Instagram changes a page,
  update `fakeInstagram.ts` to the new shape first, then the parser.
- **Threads' profile page (`threads.com/@<user>`) is the only anonymous source
  of a picture above 150 px**: `hd_profile_pic_versions` beside `username` in
  the user object of one `<script type="application/json" data-sjs>` (checked
  Nov 27, 2026). It answers about 1 MB, so ask it once per profile, never to
  probe; when it changes, update `threadsPage` in `fakeInstagram.ts` first.
- **A single photo's post embed has no JSON** (`contextJSON` is null): it is
  parsed from `img.EmbeddedMediaImage`'s srcset and `div.Caption`. Carousels
  and videos have the JSON.
- **Instagram's rate limit refuses by chance**: a login redirect marked
  `is_from_rle`, more often the faster requests come, and a refused page
  usually loads 5 s later. Dozens in a few minutes block every page for about
  10 minutes. Keep `GAP` and the retries in `instagram.ts`, and probe
  sparingly while developing: the block hits the whole IP, the app with it.
- **Requests outlast Bun's 10 s idle timeout**, so `main.ts` raises it: a first
  answer waits for the profile embed and page, each retried after 5 s when
  refused, and a zip naming a post not yet in waits for the whole profile.
- **A cut-short profile is cached like a whole one**: the page's polls land
  after its load ends, and finding nothing they would each start a new load,
  charged to the visitor. `?reload` (the page's `R`) is what drops it.
- **The page polls on the server's last answer (`profile.value`), not on what
  it shows** (`shownFor`): a kept whole copy has `pending` 0 and would stop the
  polls of a profile the server is loading again.
- **`/api/zip` never starts a load** (`peek`, not `snapshot`): it would skip
  `allow()`, so a zip for a profile not cached or loading is a 409.
- **A profile embed without `contextJSON` reads as "no public profile"**: a
  markup change at Instagram would show up as that, not as an error.
- `src/server/fakeInstagram.ts` is for tests only: nothing `main.ts` imports may
  import it, or it ships in the binary.
- `/api/media` proxies only https on `*.cdninstagram.com` and `*.fbcdn.net`
  (`cdnUrl`): widening it makes an open proxy.
