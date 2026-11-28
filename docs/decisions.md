# Decisions

Why lsel is shaped the way it is. The rules themselves live in `CLAUDE.md`,
`DESIGN.md` and `STACK.md`.

## One repo for the kit and the apps

The kit and every app live in one repo, one Bun workspace and one flake. It was
a published package with a repo per app, kept separate for each app's releases,
its own GitHub mirror and its own `squares` input. In practice every kit
release was followed by a bump in every app the same day, and a kit change
could only be tried in an app after publishing it. Now a kit change and its
fixes in the apps are one commit, checked together before anything merges.
What separate repos gave, the workspace keeps another way: per-app tags
(`<name>-v<version>`) and releases, and per-app Nix sources, so an untouched
app is a cache hit. The four apps' histories were rewritten under `apps/`
(signatures only survive on the archived originals); archived apps and moloch
stay in their own repos.

## The kit is the source of truth

Apps use what the kit provides rather than their own copies; when an app
doesn't fit, the app changes unless something real is missing, and then the
kit grows. `lsel-check` fails an app that rolls its own keys, storage, date
formats, server or styling, so the copies don't come back. How it grows is
`DESIGN.md`'s rule. Layout doesn't wait for a second app: a fitted grid or a
stable label built inside one app drifted from the kit's and broke the layout
rules (lsel-station's hand-built counts, typ's rows forced from outside).
Anything else waits, so the kit holds only what is shared, and it loses what
none uses any more.

## The kit is read from source

Apps take `@sammysul/lsel` as `workspace:*`, and its exports point at
`kit/src`: no build, no registry, no version to bump. The files Nix generates
(`tokens.css`, the palette, the fonts) reach `kit/src/lib/assets` through the
root `postinstall` in the dev shell and through the flake in a build. Versions
every member shares sit in the root catalog so there is one copy of Svelte.
Versions already on Forgejo's registry stay there for the archived apps.

## One flake, one builder

`nix/app.nix` builds any member as a web app from the workspace's one
`bun.lock`, with only that app's directory, the kit and the manifests as its
source. An app differs through arguments (yank-wars' server and web paths, its
`YW` prefix, vim for its checks), not its own derivation. Templates are
workspace members rather than `nix flake init` templates, so CI builds the
starting point like any app.

## Chromium by default, all three browsers where code differs

The dev shell carries all three browsers, since the kit and three apps have
code for one browser's quirks (typ, lsel-station, yank-wars). An app without
any runs its browser tests in Chromium only (`BROWSERS=chromium` in its
`test:e2e`): Firefox and WebKit would add time and flaky runs and test nothing
of its own.

## CI browser-tests what a push changed

Browser tests were most of CI's time (19 minutes in November 2026, while
`nix flake check` took two), and most pushes touch one app. CI runs them for
the members changed since main's last green `browsers` job (`nix/touched.sh`),
and for every member when shared code changed: the kit, the theme, Nix, the
workflow or a dependency in the lockfile. A release's version bump in
`bun.lock` counts only for its app. _Rejected:_ diffing against the previous
commit alone, since a push often cancels the run before it, whose changes
would then go untested.

A test waits for the element or answer it reads next; `networkidle` (500 ms of
quiet a page) stays only where loading has no mark of its own to wait for.

## Waiting is shown twice: a line and a bar

A waiting line names what it waits for, which also serves screen readers; a 2px
bar along the top shows that something moves, without shifting the layout. Both
wait 300 ms, so a fast answer shows neither. No spinners: a spinner is the one
rounded, decorative thing a terminal look would carry.

## One palette, no light mode

fsociety (a black terminal, a cold grade, one red accent) is
the only palette, for the sites, the terminal and the desktop alike. With one
mode there is nothing to switch, no media query to keep in step and nothing to
test twice. Cantarell and DejaVu Sans Mono, Kali's GNOME pair, go with it.

## The show's red and title face

The palette's accent is the title card's red (sampled `#C0000F`) raised to
`#f8000d`, the darkest red of that hue that still passes AA as link text on
`--base`. The app's name and favicon are set in MrRobot, KendroType's freeware
recreation of the title face, committed with its license note in
`theme/fonts/`. _Rejected:_ the exact `#C0000F` (3:1, so links couldn't be
red).

## App screens fit the window and hold still

Rules that came from fixing one app (yank-wars' list that fits the window,
buttons that stopped resizing) lived only in commits and kit code, so the next
app (grab) broke them without knowing. They are now written (`DESIGN.md`,
Layout) and checked: `lselLayout()` in every app's browser tests fails on a
page that scrolls at 1280×800 or 390×844, or on anything that moves by itself.
What it found everywhere was the kit's: fonts swapping in after the first
paint (now `font-display: optional` and `start()`, which mounts once they
are in, capped at 1.5 s, with `lselFonts()` preloading them from the page's head: over the tunnel each takes about a second, and a font that misses the wait is not used for that page view), `Status` and an empty `List` taking no height
until they had something to say, and `List` drawn at ten rows before it
fitted. A move the user caused (a key, a click) is allowed; Chromium marks
those. _Rejected:_ checking only for scrolling (the jumps were the complaint),
and `font-display: block` (a slow font still moves the text, only later).

## Motion is even

One aggressive ease-out curve made every change lurch, and the loading bar
looped off the right edge and snapped back. Changes now ease in and out,
appearing content settles in, and the bar glides edge to edge and back.

## The terminal's glitch and scanlines

The apps should look like the terminal they came from: Sammy's Ghostty shader
(`squares`' `crt.glsl`) draws faint scanlines and a vignette always and tears
the screen in red and cyan for 0.15 s when the window gains focus or tmux
switches. The kit copies its numbers exactly. The lines and vignette lie over
everything, as the shader's post-process does: a fixed pseudo-element over the
window (a modal dialog draws its own, as the top layer sits above it), its
rows counted in device pixels like the shader's `fragCoord`. Text is very
slightly dimmer for it (×0.91 on two rows in three, ×0.8 in the corners);
Sammy's call, for the terminal's look. The glitch is an SVG filter on `main`,
redrawn each frame from JavaScript with the shader's hash, bands, tear and
split, so it re-randomizes as the shader does; a filter moves nothing in the
layout. Its bands are drawn as a displacement map of flood fills (one
`feOffset` per band cost Firefox 60 ms a frame), in fractions of `main`'s box
(WebKit puts a filter's user space at the page's origin, and blanks the
element for a band outside the filter's region). It is the one decoration in
motion, so it stays at 150 ms, skips typing and stops under reduced motion.
_Rejected:_ lines on the page background only (invisible on `--base`), the
title and frame torn by stepped CSS copies (not the shader's look), and
`feTurbulence` for the bands (it can't reproduce the shader's hash).

## Deploys follow the tags

Each app's updater on `twelve` builds the newest `<name>-v*` tag and restarts
only that service (`STACK.md`). _Rejected:_ comin (every push to `squares`
would redeploy all of `twelve`, and a broken network config could cut off the
fix), deploy-rs or colmena (CI would need ssh into `twelve`),
`system.autoUpgrade` with an updated input (an uncommitted lock that the next
`deploy twelve` rolls back).

## Accounts and dailies in the kit

antenna is the second app with guests, GitHub sign-in, board names, a daily
calendar and a daily board, so they moved from yank-wars into the kit
(`server/accounts`, `server/board`, `daily`). What only one app keeps stays
in it: yank-wars' bests and days solved, synced through its own `/api/me`.
The board ranks one score either way (`better: "lower"` for keystrokes,
`"higher"` for points); yank-wars' `keys` column was renamed to `score` in
place on its first start. _Rejected:_ a shared `/api/me` with a sync per app
(antenna keeps its progress on the server, so it has nothing to sync).
