{
  description = "lsel: the shared palette, fonts and rules, the @sammysul/lsel package and the project templates";

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

          # What the package ships: tokens.css, the palette as data, the fonts and their license (kit/scripts/assets.ts).
          assets = pkgs.runCommand "lsel-assets" { } ''
            mkdir -p $out
            cp ${pkgs.writeText "tokens.css" (import ./theme/tokens.nix palettes.rose-pine-moon)} $out/tokens.css
            cp ${pkgs.writeText "palette.ts" ''
              // Generated from lsel's theme/palettes.nix; ships in @sammysul/lsel.
              export const palette = ${builtins.toJSON palettes.rose-pine-moon} as const;
            ''} $out/palette.ts
            cp ${font}/fonts/webfonts/JetBrainsMono-Regular.woff2 ${font}/fonts/webfonts/JetBrainsMono-Bold.woff2 $out/
            cp ${font}/OFL.txt $out/OFL.txt
          '';
        }
      );

      checks = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          contrast =
            pkgs.runCommand "lsel-contrast"
              {
                nativeBuildInputs = [ pkgs.bun ];
                PALETTE = pkgs.writeText "palette.json" (builtins.toJSON palettes.rose-pine-moon);
              }
              ''
                cp ${./theme/contrast.test.ts} contrast.test.ts
                HOME=$TMPDIR bun test ./contrast.test.ts
                touch $out
              '';
        }
      );

      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShellNoCC (
            {
              packages = [
                pkgs.bun
                pkgs.biome
              ];
              # kit/package.json's playwright-core must equal this driver's version
              PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
              PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
              PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
              PLAYWRIGHT_DRIVER_VERSION = pkgs.playwright-driver.version;
            }
            // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
              __EGL_VENDOR_LIBRARY_DIRS = "${pkgs.mesa}/share/glvnd/egl_vendor.d";
            }
          );
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
