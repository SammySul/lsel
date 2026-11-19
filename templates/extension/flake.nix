{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    lsel-nix = {
      url = "git+https://git.sammysul.com/SammySul/lsel-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      lsel-nix,
    }:
    let
      forEachSystem = nixpkgs.lib.genAttrs lsel-nix.lib.systems;
    in
    {
      packages = forEachSystem (system: {
        default = lsel-nix.legacyPackages.${system}.extension { root = ./.; };
      });

      # the build, then `bun run check` and `test`, as CI runs them
      checks = forEachSystem (
        system:
        let
          extension = self.packages.${system}.default;
        in
        { package = extension; } // extension.tests
      );

      devShells = forEachSystem (system: {
        default = lsel-nix.devShells.${system}.extension;
      });
    };
}
