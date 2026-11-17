{
  description = "lsel: the shared palette, fonts, rules and project template";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      forEachSystem = nixpkgs.lib.genAttrs [
        "aarch64-darwin"
        "x86_64-linux"
      ];
      palettes = import ./theme/palettes.nix;
    in
    {
      lib = {
        inherit palettes;
        palette = palettes.rose-pine-moon;
      };

      packages = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          font = pkgs.jetbrains-mono.src;
        in
        {
          # `nix run lsel#favicon -- d > favicon.svg`: a letter as a path, so no font is needed to show it
          favicon =
            pkgs.writers.writePython3Bin "lsel-favicon"
              {
                libraries = [ pkgs.python3Packages.fonttools ];
                flakeIgnore = [ "E501" ];
              }
              (
                builtins.replaceStrings
                  [ "@font@" "@base@" "@accent@" ]
                  [
                    "${pkgs.jetbrains-mono}/share/fonts/truetype/JetBrainsMono-Bold.ttf"
                    palettes.rose-pine-moon.base
                    palettes.rose-pine-moon.accent
                  ]
                  (builtins.readFile ./scripts/favicon.py)
              );

          # What `bun run sync` copies into a project: tokens.css, the two weights it loads, their license.
          assets = pkgs.runCommand "lsel-assets" { } ''
            mkdir -p $out
            cp ${pkgs.writeText "tokens.css" (import ./theme/tokens.nix palettes.rose-pine-moon)} $out/tokens.css
            cp ${font}/fonts/webfonts/JetBrainsMono-Regular.woff2 ${font}/fonts/webfonts/JetBrainsMono-Bold.woff2 $out/
            cp ${font}/OFL.txt $out/OFL.txt
          '';
        }
      );

      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShellNoCC { packages = [ pkgs.bun ]; };
        }
      );

      # A new project's first `bun run check` runs Biome on the template's files, so they must pass as shipped.
      checks = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          template-biome = pkgs.runCommand "lsel-template-biome" { nativeBuildInputs = [ pkgs.biome ]; } ''
            cp -r ${./templates/web} web && chmod -R u+w web && cd web
            biome check --vcs-enabled=false .
            touch $out
          '';
        }
      );

      templates.extension = {
        path = ./templates/extension;
        description = "A browser extension with a Svelte popup: dev shell, Nix package and CI that releases a zip on a version bump";
      };

      templates.web = {
        path = ./templates/web;
        description = "A Svelte page served by Bun: dev shell, Nix package, browser tests and CI that releases on a version bump";
      };
    };
}
