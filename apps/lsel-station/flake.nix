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
        default = lsel.legacyPackages.${system}.webApp { root = ./.; };
      });

      # the build, then `bun run check` and `test`, as CI runs them
      checks = forEachSystem (
        system:
        let
          app = self.packages.${system}.default;
        in
        { package = app; } // app.tests
      );

      devShells = forEachSystem (system: {
        # not `web`: the sound code handles Firefox's and WebKit's audio quirks, which only those browsers test
        default = lsel.devShells.${system}.web-all-browsers;
      });
    };
}
