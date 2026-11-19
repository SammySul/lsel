# lsel

Private home base: the shared rules, the `@sammysul/lsel` package every project
builds on, and the project templates, with every project checked out under
`projects/`.

```
CLAUDE.md          rules and traps every project inherits
DESIGN.md          look and feel
STACK.md           stack, release and deploy defaults
ideas.md           ideas not yet in a project
theme/             palettes.nix, tokens.nix and the contrast test
kit/               @sammysul/lsel: tokens.css and fonts, components, keys, states,
                   formats, the server, test helpers, shared configs, lsel-check
scripts/sync.ts    keeps the Nix and CI files projects take from a template identical
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

## Changing the package

Edit `kit/` (its playground, `bun run dev` there, shows every component in every
state), bump `kit/package.json`'s version and push: CI tests it and publishes
any version not yet in Forgejo's registry. Then `bun update @sammysul/lsel` in
each project; a breaking change updates them all in the same sitting.

## Changing a template

A project's `lsel.json` lists the template files it takes as they are
(`"files"`, from `"template"`: `web` unless it says `extension`). Edit the
file in `templates/`, commit, then `bun run sync <project>` and commit it there.

## Changing the palette or tokens

Edit `theme/` and run `bun run test`; the package carries `tokens.css`, so
release it as above. `squares` follows with `nix flake update lsel`.
