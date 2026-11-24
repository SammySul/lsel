{
  description = "lsel: the shared palette, fonts and rules, the kit every app renders through, and the apps";

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

      # each runs on twelve, which `squares` builds from these
      apps = pkgs: {
        typ.dir = "apps/typ";
        dajaj.dir = "apps/dajaj";
        lsel-station.dir = "apps/lsel-station";
        # sammysul.com: what the others are and where they run
        sammysul.dir = "apps/sammysul";
        yank-wars = {
          dir = "apps/yank-wars";
          prefix = "YW";
          server = "server/src/main.ts";
          web = "web/dist";
          # its tests check the answer files were made with this vim
          checkInputs = [ pkgs.vim ];
        };
      };

      workspace =
        pkgs:
        let
          bun2nix' = bun2nixFor pkgs;
          root = ./.;
          inherit (self.packages.${pkgs.stdenv.hostPlatform.system}) assets;
          bunDeps = bun2nix'.fetchBunDeps {
            bunNix = ./bun.nix;
            overrides = bun2nix'.patchedDependenciesToOverrides {
              patchedDependencies = nixpkgs.lib.mapAttrs (
                _: path: root + "/${path}"
              ) (nixpkgs.lib.importJSON ./package.json).patchedDependencies;
            };
          };
          member = import ./nix/member.nix {
            inherit (nixpkgs) lib;
            bun2nix = bun2nix';
            inherit root assets bunDeps;
          };
          app = pkgs.callPackage ./nix/app.nix { inherit root member; };
        in
        {
          apps = nixpkgs.lib.mapAttrs (name: args: app ({ inherit name; } // args)) (
            apps pkgs
            // {
              # the starting point for a new app, built so it stays working
              template-web.dir = "templates/web";
            }
          );

          # the kit's `bun run check` and `test`; its browser tests run in CI's dev shell
          kit = member [ (root + "/kit") ] {
            pname = "lsel-kit-check";
            version = "0";
            buildPhase = ''
              cd kit
              bun run check
              bun run test
            '';
            installPhase = "touch $out";
          };
        };
    in
    {
      lib = {
        inherit palettes systems;
        palette = palettes.melange;
      };

      packages = forEachSystem (
        pkgs:
        let
          font = pkgs.jetbrains-mono.src;
          inter = pkgs.inter.src;
        in
        {
          bun2nix = bun2nixFor pkgs;

          release = pkgs.writeShellApplication {
            name = "lsel-release";
            runtimeInputs = [
              pkgs.curl
              pkgs.git
              pkgs.jq
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
                    palettes.melange.base
                    palettes.melange.accent
                  ]
                  (builtins.readFile ./scripts/favicon.py)
              );

          # The kit's generated files: tokens.css, the palette as data, the fonts and their license.
          assets = pkgs.runCommand "lsel-assets" { } ''
            mkdir -p $out
            cp ${pkgs.writeText "tokens.css" (import ./theme/tokens.nix palettes.melange)} $out/tokens.css
            cp ${pkgs.writeText "palette.ts" ''
              // Generated from lsel's theme/palettes.nix.
              export const palette = ${builtins.toJSON palettes.melange} as const;
            ''} $out/palette.ts
            cp ${font}/fonts/webfonts/JetBrainsMono-Regular.woff2 ${font}/fonts/webfonts/JetBrainsMono-Bold.woff2 $out/
            cp ${font}/OFL.txt $out/OFL.txt
            cp ${inter}/web/Inter-Regular.woff2 ${inter}/web/Inter-Bold.woff2 $out/
            cp ${inter}/LICENSE.txt $out/Inter-OFL.txt
          '';
        }
        // removeAttrs (workspace pkgs).apps [ "template-web" ]
      );

      checks = forEachSystem (
        pkgs:
        let
          inherit (workspace pkgs) apps kit;
        in
        {
          # writeShellApplication runs shellcheck on it
          inherit (self.packages.${pkgs.stdenv.hostPlatform.system}) release;
          contrast =
            pkgs.runCommand "lsel-contrast"
              {
                nativeBuildInputs = [ pkgs.bun ];
                PALETTE = pkgs.writeText "palette.json" (builtins.toJSON palettes.melange);
              }
              ''
                cp ${./theme/contrast.test.ts} contrast.test.ts
                HOME=$TMPDIR bun test ./contrast.test.ts
                touch $out
              '';
          kit-check = kit;
          biome = pkgs.runCommand "lsel-biome" { nativeBuildInputs = [ pkgs.biome ]; } ''
            cd ${./.}
            biome check --vcs-enabled=false .
            touch $out
          '';
        }
        // apps
        // nixpkgs.lib.mapAttrs' (name: app: nixpkgs.lib.nameValuePair "${name}-check" app.tests.check) apps
      );

      devShells = forEachSystem (pkgs: {
        # Firefox and WebKit too: the kit and typ, lsel-station and yank-wars have code for their quirks
        default = pkgs.mkShellNoCC (
          {
            packages = [
              pkgs.bun
              pkgs.biome
              (bun2nixFor pkgs)
              pkgs.nixfmt
              pkgs.shellcheck
              # yank-wars' oracle replays its cases in real vim
              pkgs.vim
            ];
            # playwright-core in the catalog must equal this driver's version
            PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            # its host check looks for system libraries via ldconfig, which Nix's browsers bring themselves
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
            PLAYWRIGHT_DRIVER_VERSION = pkgs.playwright-driver.version;
          }
          # WebKit (WPE) needs an EGL driver; Nix's libglvnd looks only in NixOS's /run/opengl-driver
          // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
            __EGL_VENDOR_LIBRARY_DIRS = "${pkgs.mesa}/share/glvnd/egl_vendor.d";
          }
        );
      });

      formatter = forEachSystem (pkgs: pkgs.nixfmt-tree);
    };
}
