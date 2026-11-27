# grab

Shared rules come from lsel's `CLAUDE.md`; this file holds only this project's
traps. The why behind the design: `docs/decisions.md`.

- **Only three Instagram pages answer without a login** (checked Nov 27,
  2026): the profile embed (`/<user>/embed/`), the profile page (`/<user>/`,
  only with `Sec-Fetch-*` navigation headers, or it redirects to the login) and
  the post embed (`/p/<code>/embed/captioned/`). `web_profile_info` and the
  GraphQL `doc_id` queries answer 404 or 401. When Instagram changes a page,
  update `fakeInstagram.ts` to the new shape first, then the parser.
- **A single photo's post embed has no JSON** (`contextJSON` is null): it is
  parsed from `img.EmbeddedMediaImage`'s srcset and `div.Caption`. Carousels
  and videos have the JSON.
- **Instagram's rate limit refuses by chance**: a login redirect marked
  `is_from_rle`, more often the faster requests come, and a refused page
  usually loads 5 s later. Dozens in a few minutes block every page for about
  10 minutes. Keep `GAP` and the retries in `instagram.ts`, and probe
  sparingly while developing: the block hits the whole IP, the app with it.
- A cold profile takes 20 to 50 s, so `main.ts` raises Bun's 10 s idle timeout
  and the page polls `snapshot()` while posts are `pending`.
- **A profile embed without `contextJSON` reads as "no public profile"**: a
  markup change at Instagram would show up as that, not as an error.
- `src/server/fakeInstagram.ts` is for tests only: nothing `main.ts` imports may
  import it, or it ships in the binary.
- `/api/media` proxies only https on `*.cdninstagram.com` and `*.fbcdn.net`
  (`cdnUrl`): widening it makes an open proxy.
