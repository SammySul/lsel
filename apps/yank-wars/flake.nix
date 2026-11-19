{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    lsel = {
      url = "git+https://git.sammysul.com/SammySul/lsel";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, lsel, ... }:
    let
      forEachSystem = nixpkgs.lib.genAttrs lsel.lib.systems;
    in
    {
      # its own build: a workspace with `bun patch` patches, which lsel's webApp doesn't lay out
      packages = forEachSystem (system: {
        default = nixpkgs.legacyPackages.${system}.callPackage ./nix/package.nix {
          inherit (lsel.packages.${system}) bun2nix;
          inherit (lsel.lib) bunCacheAlias;
        };
      });

      devShells = forEachSystem (system: {
        default = lsel.devShells.${system}.web-all-browsers.overrideAttrs (old: {
          # the oracle: `bun run oracle` replays test cases in real vim
          nativeBuildInputs = old.nativeBuildInputs ++ [ nixpkgs.legacyPackages.${system}.vim ];
        });
      });
    };
}
