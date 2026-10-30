# The shape apps/server will use: bun2nix turns bun.lock into a Bun cache and
# compiles the entry point into one binary.
{ lib, bun2nix }:
let
  packageJson = lib.importJSON ./package.json;
  # `bun patch` records its patches here; bun2nix applies them to the cached
  # packages and strips the field before its sandboxed `bun install`.
  patchedDependencies = lib.mapAttrs (_: path: ./. + "/${path}") (
    packageJson.patchedDependencies or { }
  );
in
bun2nix.mkDerivation {
  packageJson = ./package.json;
  src = ./.;

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./bun.nix;
    overrides = bun2nix.patchedDependenciesToOverrides { inherit patchedDependencies; };
  };

  # index.ts uses top-level await, which bytecode (CommonJS) can't express
  bunCompileToBytecode = false;

  # the postinstall wants the dev shell's bun2nix, absent in the sandbox; no
  # dependency here has install scripts of its own
  dontRunLifecycleScripts = true;
}
