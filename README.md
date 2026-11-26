# lsel

Sammy's apps and the kit they share, in one Bun workspace and one flake. What
each app is and where it runs: [sammysul.com](https://sammysul.com).

```
CLAUDE.md          rules and traps every app inherits
DESIGN.md          look and feel
STACK.md           stack, release and deploy
docs/decisions.md  why it is shaped this way
theme/             palette.nix, tokens.nix and the contrast test
nix/               the workspace builders, bun2nix's patch, the release script
kit/               @sammysul/lsel: tokens.css and fonts, components, keys, states,
                   formats, the server, test helpers, the shared tsconfig, lsel-check
apps/              typ, dajaj, lsel-station, yank-wars, sammysul (the sammysul.com page)
templates/web/     the starting point for a new app: a Svelte page served by Bun
patches/           `bun patch` patches, for the whole workspace
```

## Working on it

Everything runs in the dev shell (`direnv allow`, or `nix develop -c …`):

```sh
bun install          # the whole workspace, from anywhere in it
nix flake check      # every app's build, check and tests, the kit's, Biome
bun run build        # every member
bun run test:e2e     # every member's browser tests
```

Inside an app or `kit/`, its own scripts (`bun run dev`, `check`, `test`, …)
cover just that member. The kit's playground (`bun run dev` in `kit/`) shows
every component in every state.

## A new app

```sh
cp -R templates/web apps/<name>
# in apps/<name>: "name" and "version" in package.json (the binary, the env
# prefix and the page take the name from there), and <title> in src/web/index.html
nix run .#favicon -- <letter> > apps/<name>/src/web/public/favicon.svg
bun install
```

Then add it to `apps` in `flake.nix`, which builds and checks it, and to the
list in `apps/sammysul/src/web/projects.ts`, and deploy it from `squares`
(STACK.md).

## Releasing

Bump `version` in an app's `package.json` and push `main`: CI tags
`<name>-v<version>`, and twelve runs it within five minutes (STACK.md).
