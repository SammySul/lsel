# typ

Shared rules come from lsel's `CLAUDE.md`; this file holds only this project's
traps.

- **Fonts live in the visitor's IndexedDB** (`FontsDB`, store `fonts`, key
  `fontName`) under typ.sammysul.com. Renaming the database, the store or the
  origin loses everyone's fonts. Records written by the first typ (`blob`, and
  before that `fontBase64`) must keep loading; the e2e test covers both.
- New records keep raw `bytes`: WebKit's private mode (Safari private windows,
  Playwright's WebKit) refuses Blobs in IndexedDB.
