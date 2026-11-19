{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    lsel-nix = {
      url = "git+https://git.sammysul.com/SammySul/lsel-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, lsel-nix, ... }:
    let
      forEachSystem = nixpkgs.lib.genAttrs lsel-nix.lib.systems;
    in
    {
      # its own build: a workspace with `bun patch` patches, which lsel-nix's webApp doesn't lay out
      packages = forEachSystem (system: {
        default = nixpkgs.legacyPackages.${system}.callPackage ./nix/package.nix {
          inherit (lsel-nix.packages.${system}) bun2nix;
          inherit (lsel-nix.lib) bunCacheAlias;
        };
      });

      devShells = forEachSystem (system: {
        default = lsel-nix.devShells.${system}.web.overrideAttrs (old: {
          # the oracle: `bun run oracle` replays test cases in real vim
          nativeBuildInputs = old.nativeBuildInputs ++ [ nixpkgs.legacyPackages.${system}.vim ];
        });
      });
    };
}
