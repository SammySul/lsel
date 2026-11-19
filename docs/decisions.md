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

## Sync stays, for Nix and CI only

A flake library (`lsel.lib.mkWebApp`) would centralize the Nix build, but lsel is
private, so public projects couldn't fetch it, every project would still bump a
flake input, and CI files can't live in a flake. `bun run sync` keeps the few
files that must be identical (`flake.nix`, `nix/*`, `ci.yml`, `.npmrc`,
`bunfig.toml`) in step instead. Configs that can extend, extend the package.

## Waiting is shown twice: a line and a bar

A waiting line names what it waits for, which also serves screen readers; a 2px
bar along the top shows that something moves, without shifting the layout. Both
wait 300 ms, so a fast answer shows neither. No spinners: a spinner is the one
rounded, decorative thing a terminal look would carry.
