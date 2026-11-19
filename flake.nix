{
  description = "lsel: the shared palette, fonts and rules, the @sammysul/lsel package, the Nix every project builds with and the project templates";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix?ref=2.1.2";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      bun2nix,
    }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-linux"
      ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      palettes = import ./theme/palettes.nix;
      # 2.1.2 rejects bun >= 1.3's lockfileVersion 2; upstream PR #110. Drop once released.
      bun2nixFor =
        pkgs:
        bun2nix.packages.${pkgs.stdenv.hostPlatform.system}.default.overrideAttrs (old: {
          patches = (old.patches or [ ]) ++ [ ./nix/bun2nix-lockfile-v2.patch ];
        });
    in
    {
      lib = {
        inherit palettes systems;
        palette = palettes.rose-pine-moon;
        # the builders run it; a project's own derivation needs it too
        bunCacheAlias = builtins.readFile ./nix/bun-cache-alias.sh;
      };

      packages = forEachSystem (
        pkgs:
        let
          font = pkgs.jetbrains-mono.src;
        in
        {
          bun2nix = bun2nixFor pkgs;

          release = pkgs.writeShellApplication {
            name = "lsel-release";
            runtimeInputs = [
              pkgs.curl
              pkgs.git
              pkgs.jq
              pkgs.zip
            ];
            text = builtins.readFile ./nix/release.sh;
          };

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

      # functions, not packages: each needs the project's root
      legacyPackages = forEachSystem (
        pkgs:
        let
          bunProject = import ./nix/bun-project.nix {
            inherit (pkgs) lib biome;
            bun2nix = bun2nixFor pkgs;
          };
        in
        {
          webApp = args: pkgs.callPackage ./nix/web-app.nix ({ inherit bunProject; } // args);
          extension = args: pkgs.callPackage ./nix/extension.nix ({ inherit bunProject; } // args);
        }
      );

      checks = forEachSystem (pkgs: {
        # writeShellApplication runs shellcheck on it
        inherit (self.packages.${pkgs.stdenv.hostPlatform.system}) release;
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
      });

      devShells = forEachSystem (
        pkgs:
        let
          packages = [
            pkgs.bun
            pkgs.biome
            (bun2nixFor pkgs)
          ];
          # playwright-core in package.json must equal this driver's version
          playwright = browsers: {
            PLAYWRIGHT_BROWSERS_PATH = browsers;
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            # its host check looks for system libraries via ldconfig, which Nix's browsers bring themselves
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
            PLAYWRIGHT_DRIVER_VERSION = pkgs.playwright-driver.version;
          };
          webAllBrowsers = pkgs.mkShellNoCC (
            {
              inherit packages;
            }
            // playwright pkgs.playwright-driver.browsers
            # WebKit (WPE) needs an EGL driver; Nix's libglvnd looks only in NixOS's /run/opengl-driver
            // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
              __EGL_VENDOR_LIBRARY_DIRS = "${pkgs.mesa}/share/glvnd/egl_vendor.d";
            }
          );
        in
        {
          extension = pkgs.mkShellNoCC { inherit packages; };
          # @sammysul/lsel/testing's browsers() reads BROWSERS
          web = pkgs.mkShellNoCC (
            {
              inherit packages;
              BROWSERS = "chromium";
            }
            // playwright (
              pkgs.playwright-driver.browsers.override {
                withFirefox = false;
                withWebkit = false;
              }
            )
          );
          web-all-browsers = webAllBrowsers;
          # the kit's, which every project renders through
          default = webAllBrowsers.overrideAttrs (old: {
            nativeBuildInputs = old.nativeBuildInputs ++ [
              pkgs.nixfmt
              pkgs.shellcheck
            ];
          });
        }
      );

      formatter = forEachSystem (pkgs: pkgs.nixfmt-tree);

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
