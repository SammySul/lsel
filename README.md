# lsel

Private home base: the shared palette, font, rules and project template, with
every project checked out under `projects/`.

```
CLAUDE.md          rules and traps every project inherits
DESIGN.md          look and feel
STACK.md           stack, release and deploy defaults
ideas.md           ideas not yet in a project
theme/             palettes.nix, tokens.nix and the contrast test
scripts/sync.ts    copies the built assets into projects
templates/web/     the starting point for a new project
projects/          one repo per project (ignored here)
```

## A new project

```sh
mkdir projects/<name> && cd projects/<name>
nix flake init -t ../..#web
git init && git add -A && direnv allow
bun install
cd ../.. && bun run sync
```

## Changing the palette or tokens

Edit `theme/`, run `bun test`, commit, then `bun run sync` and commit the
changed assets in each project. `bun run sync --check` lists projects that are
out of date. `squares` follows with `nix flake update lsel`.
