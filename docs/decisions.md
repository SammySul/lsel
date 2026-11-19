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

The package is public on Forgejo's npm registry (owned by the public user, so
anyone can install it while lsel stays private). Projects pin an exact version:
an update is a deliberate bump, tested in that project, and `bun.nix` hashes the
tarball. CI publishes any version in `kit/package.json` not yet in the registry.

## Shared Nix is a flake, not synced copies

The Nix build, dev shells, bun2nix fixes and release live in `lsel-nix`, a
public flake every project takes as an input, as the package is public for the
same reason. It replaced a script that copied template files into each project:
copies had no version, and a project that differed had to stop taking the file
and with it every later fix. A project overrides what differs (`overrideAttrs`,
or its own derivation on the shared bun2nix); something moves into `lsel-nix`
only once two projects need it. Templates are copied once, by `nix flake init`.

## Waiting is shown twice: a line and a bar

A waiting line names what it waits for, which also serves screen readers; a 2px
bar along the top shows that something moves, without shifting the layout. Both
wait 300 ms, so a fast answer shows neither. No spinners: a spinner is the one
rounded, decorative thing a terminal look would carry.
