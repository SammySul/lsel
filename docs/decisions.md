# Decisions

Why lsel is shaped the way it is. The rules themselves live in `CLAUDE.md`,
`DESIGN.md` and `STACK.md`.

## A package, not a monorepo

Shared code lives in `@sammysul/lsel` (`kit/`), and each project stays its own
repo. A monorepo would have bought one-commit changes across projects, but
every project has its own releases, its own public GitHub mirror with a clean
history, and its own `squares` flake input; all three assume separate repos.

## The package is the source of truth

Projects adopt what the package provides and delete their own copies; when a
project doesn't fit, the project changes unless something real is missing, and
then the package grows. `lsel-check` fails a project that rolls its own keys,
storage, date formats, server or styling, so the copies don't come back. It
grows only from what two or more projects need; one project's piece stays there.

## Published to Forgejo, pinned exactly

The package is public on Forgejo's npm registry. Projects pin an exact version:
an update is a deliberate bump, tested in that project, and `bun.nix` hashes the
tarball. CI publishes any version in `kit/package.json` not yet in the registry.
A git dependency on lsel can't replace it: bun (1.4) installs no subdirectory of
a repo, and the tarball carries files Nix generates (`tokens.css`, the fonts).

## Shared Nix is lsel's flake, not synced copies

The Nix build, dev shells, bun2nix fixes and release live in lsel's flake
(`nix/`), which every project takes as its `lsel` input. It replaced a script
that copied template files into each project: copies had no version, and a
project that differed had to stop taking the file and with it every later fix.
A project overrides what differs (`overrideAttrs`, or its own derivation on the
shared bun2nix); something moves into `nix/` only once two projects need it.
Templates are copied once, by `nix flake init`. It was a separate public flake,
`lsel-nix`, only while lsel was private; once lsel went public, one repo meant
one input to update and nothing to keep in step.

## Chromium by default, all three browsers where code differs

The `web` shell carries only Chromium: most projects have no code that differs
by browser, and Firefox and WebKit cost CI downloads, a Linux EGL workaround and
flaky runs. The kit, which every project renders through, and a project with
code written for one browser's quirks (typ, lsel-station, yank-wars) take
`web-all-browsers`, so those fixes stay tested.

## Waiting is shown twice: a line and a bar

A waiting line names what it waits for, which also serves screen readers; a 2px
bar along the top shows that something moves, without shifting the layout. Both
wait 300 ms, so a fast answer shows neither. No spinners: a spinner is the one
rounded, decorative thing a terminal look would carry.
