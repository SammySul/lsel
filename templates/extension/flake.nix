{
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
      forEachSystem = nixpkgs.lib.genAttrs [
        "aarch64-darwin"
        "x86_64-linux"
      ];
      # 2.1.2 rejects bun >= 1.3's lockfileVersion 2; upstream PR #110. Drop once released.
      bun2nixFor =
        system:
        bun2nix.packages.${system}.default.overrideAttrs (old: {
          patches = (old.patches or [ ]) ++ [ ./nix/bun2nix-lockfile-v2.patch ];
        });
    in
    {
      packages = forEachSystem (system: {
        default = nixpkgs.legacyPackages.${system}.callPackage ./nix/package.nix {
          bun2nix = bun2nixFor system;
        };
      });

      # the package's check phase runs the unit tests
      checks = forEachSystem (system: {
        package = self.packages.${system}.default;
      });

      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          # zip packs the release
          default = pkgs.mkShellNoCC {
            packages = [
              pkgs.bun
              pkgs.biome
              pkgs.zip
              (bun2nixFor system)
            ];
          };
        }
      );
    };
}
