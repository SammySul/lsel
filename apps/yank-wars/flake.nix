{
  description = "yank-wars";

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
      ...
    }:
    let
      # mac for dev, x86_64-linux for twelve
      forEachSystem = nixpkgs.lib.genAttrs [
        "aarch64-darwin"
        "x86_64-linux"
      ];
      # 2.1.2 rejects the lockfileVersion 2 that bun >= 1.3 writes; the patch is
      # upstream PR #110. Drop it once a release contains it.
      bun2nixFor =
        system:
        bun2nix.packages.${system}.default.overrideAttrs (old: {
          patches = (old.patches or [ ]) ++ [ ./nix/bun2nix-lockfile-v2.patch ];
        });
    in
    {
      packages = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.callPackage ./nix/package.nix { bun2nix = bun2nixFor system; };
          # step 0 of docs/decisions.md: proves the Bun-in-Nix route
          headless-replay = pkgs.callPackage ./spikes/headless-replay/package.nix {
            bun2nix = bun2nixFor system;
          };
        }
      );

      nixosModules.default =
        { lib, pkgs, ... }:
        {
          imports = [ ./nix/module.nix ];
          services.yank-wars.package = lib.mkDefault self.packages.${pkgs.stdenv.hostPlatform.system}.default;
        };

      checks.x86_64-linux.module = nixpkgs.legacyPackages.x86_64-linux.callPackage ./nix/module-test.nix {
        module = ./nix/module.nix;
        package = self.packages.x86_64-linux.default;
      };

      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShellNoCC {
            packages = with pkgs; [
              bun
              biome
              # regenerates bun.nix from bun.lock (package.json postinstall)
              (bun2nixFor system)
              # the oracle: `bun run oracle` replays test cases in real vim
              vim
            ];
            # `bun run test:browser`; playwright-core in package.json must equal this version
            PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            # its host check looks for system libraries via ldconfig, which Nix's browsers bring themselves
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
            PLAYWRIGHT_DRIVER_VERSION = pkgs.playwright-driver.version;
          };
        }
      );
    };
}
