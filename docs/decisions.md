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
formats, server or styling, so the copies don't come back. The kit grows only
from what two or more apps need, and loses what none uses any more; one app's
piece stays in that app.

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

## Waiting is shown twice: a line and a bar

A waiting line names what it waits for, which also serves screen readers; a 2px
bar along the top shows that something moves, without shifting the layout. Both
wait 300 ms, so a fast answer shows neither. No spinners: a spinner is the one
rounded, decorative thing a terminal look would carry.

## One palette, no light mode

fsociety (Mr. Robot's Kali: a black terminal, a cold grade, one red accent) is
the only palette, for the sites, the terminal and the desktop alike. With one
mode there is nothing to switch, no media query to keep in step and nothing to
test twice. Cantarell and DejaVu Sans Mono, Kali's GNOME pair, go with it.
