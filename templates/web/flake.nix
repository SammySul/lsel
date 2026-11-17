{
  description = "a project in lsel";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix?ref=2.1.2";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
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
                (bun2nixFor system)
              ];
              # playwright-core in package.json must equal this driver's version
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
        }
      );
    };
}
