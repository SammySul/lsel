{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    lsel = {
      url = "git+https://git.sammysul.com/SammySul/lsel";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      lsel,
    }:
    let
      forEachSystem = nixpkgs.lib.genAttrs lsel.lib.systems;
    in
    {
      packages = forEachSystem (system: {
        default = lsel.legacyPackages.${system}.extension { root = ./.; };
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
        default = lsel.devShells.${system}.extension;
      });
    };
}
