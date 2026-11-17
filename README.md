# lsel

Private home base: the shared palette, font, rules and project template, with
every project checked out under `projects/`.

```
CLAUDE.md          rules and traps every project inherits
DESIGN.md          look and feel
STACK.md           stack, release and deploy defaults
ideas.md           ideas not yet in a project
theme/             palettes.nix, tokens.nix and the contrast test
scripts/sync.ts    copies the assets and the shared template files into projects
templates/web/     the starting point for a new app: a Svelte page served by Bun
templates/extension/  the starting point for a browser extension
projects/          one repo per project (ignored here)
```

## A new project

```sh
mkdir projects/<name> && cd projects/<name>
nix flake init -t ../..#web        # or ../..#extension
# set "name" in package.json: the binary, the env prefix and the page take it from there
# (an extension: also "name" and "description" in manifest.json)
nix run ../..#favicon -- <letter> > src/web/public/favicon.svg   # an app only
git init && git add -A && direnv allow
bun install
```

## Changing a template

A project's `lsel.json` lists the template files it takes as they are
(`"files"`, from `"template"`: `web` unless it says `extension`). Edit the
file in `templates/`, commit, then `bun run sync` and commit it in each project.

## Changing the palette or tokens

Edit `theme/`, run `bun run test`, commit, then `bun run sync` and commit the
changed assets in each project. `bun run sync --check` lists projects that are
out of date, the templates among them. `squares` follows with `nix flake update lsel`.
