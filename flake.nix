{
  description = "lsel: the shared palette, fonts, rules and project template";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      forEachSystem = nixpkgs.lib.genAttrs [
        "aarch64-darwin"
        "x86_64-linux"
      ];
      palettes = import ./theme/palettes.nix;
    in
    {
      lib = {
        inherit palettes;
        palette = palettes.rose-pine-moon;
      };

      packages = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          font = pkgs.jetbrains-mono.src;
        in
        {
          # What `bun run sync` copies into a project: tokens.css, the two weights it loads, their license.
          assets = pkgs.runCommand "lsel-assets" { } ''
            mkdir -p $out
            cp ${pkgs.writeText "tokens.css" (import ./theme/tokens.nix palettes.rose-pine-moon)} $out/tokens.css
            cp ${font}/fonts/webfonts/JetBrainsMono-Regular.woff2 ${font}/fonts/webfonts/JetBrainsMono-Bold.woff2 $out/
            cp ${font}/OFL.txt $out/OFL.txt
          '';
        }
      );

      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShellNoCC { packages = [ pkgs.bun ]; };
        }
      );

      templates.web = {
        path = ./templates/web;
        description = "A Bun project with the lsel dev shell, Biome, strict TypeScript and CI that releases on a version bump";
      };
    };
}
