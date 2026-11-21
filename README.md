# lsel

Home base: the shared rules, the kit every app renders through, the apps
themselves and the Nix that builds them, in one Bun workspace and one flake.

```
CLAUDE.md          rules and traps every app inherits
DESIGN.md          look and feel
STACK.md           stack, release and deploy defaults
theme/             palettes.nix, tokens.nix and the contrast test
nix/               the app builder, bun2nix's patch, the release script
kit/               @sammysul/lsel: tokens.css and fonts, components, keys, states,
                   formats, the server, test helpers, shared configs, lsel-check
apps/              typ, dajaj, lsel-station, yank-wars, sammysul (the sammysul.com page)
templates/web/     the starting point for a new app: a Svelte page served by Bun
patches/           `bun patch` patches, for the whole workspace
projects/          repos that stay separate (ignored here)
```

## Working on it

Everything runs in the dev shell (`direnv allow`, or `nix develop -c …`):

```sh
bun install          # the whole workspace, from anywhere in it
nix flake check      # every app's build, check and tests, the kit's, Biome
bun run build        # every member
bun run test:e2e     # every member's browser tests
```

Inside an app, its own scripts (`bun run dev`, `check`, `test`, …) work as
before. The kit's playground (`bun run dev` in `kit/`) shows every component
in every state.

## A new app

```sh
cp -R templates/web apps/<name>
# set "name" (the binary, the env prefix and the page take it from there) and "version" in its package.json
nix run .#favicon -- <letter> > apps/<name>/src/web/public/favicon.svg
bun install
```

Then add it to `apps` in `flake.nix`, which builds and checks it, and deploy it
from `squares` (STACK.md).

## Changing the kit, the palette or the Nix

Edit it and run the checks above: every app uses the kit from source, so a
change and its fixes in the apps land in one commit. A palette change also
reaches `squares` with `nix flake update lsel`.
