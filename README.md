# lsel

Home base: the shared rules, the `@sammysul/lsel` package every project
builds on, the Nix every project builds with and the project templates, with
every project checked out under `projects/`.

```
CLAUDE.md          rules and traps every project inherits
DESIGN.md          look and feel
STACK.md           stack, release and deploy defaults
ideas.md           ideas not yet in a project
theme/             palettes.nix, tokens.nix and the contrast test
nix/               the builders, bun2nix's patch and cache fix, the release script
kit/               @sammysul/lsel: tokens.css and fonts, components, keys, states,
                   formats, the server, test helpers, shared configs, lsel-check
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
any version not yet in Forgejo's registry. Then `bun add @sammysul/lsel@<version>
--exact` in each project; a breaking change updates them all in the same sitting.

## Changing the shared Nix

A template is copied once; nothing keeps a project in step with it. What every
project builds with comes from this flake, which each project takes as its
`lsel` input: the builders (`legacyPackages.<system>.webApp` and `.extension`,
each with `.tests.check`), the dev shells (`web` with Chromium,
`web-all-browsers`, `extension`), the patched bun2nix and `lsel-release`. Change
it here and push, then `nix flake update lsel` in each project and commit. Try a
change on a project first with `--override-input lsel git+file:../..`, which
takes the tracked files only.

A project that differs changes what it gets back rather than this flake:
`.overrideAttrs` on a package or shell, or its own derivation built with
`packages.<system>.bun2nix` and `lib.bunCacheAlias`. Something moves here only
once two projects need it.

## Changing the palette or tokens

Edit `theme/` and run `nix flake check`; the package carries `tokens.css` and the palette, so
release it as above. `squares` follows with `nix flake update lsel`.
