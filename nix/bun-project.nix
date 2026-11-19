{
  lib,
  bun2nix,
  biome,
}:
root: files: args:
let
  common = {
    packageJson = root + "/package.json";
    bunDeps = bun2nix.fetchBunDeps { bunNix = root + "/bun.nix"; };
    # until bun2nix names bun's cache entries for a registry with a path
    postBunSetInstallCacheDirPhase = builtins.readFile ./bun-cache-alias.sh;
    # the postinstall wants the dev shell's bun2nix; no dependency here has install scripts
    dontRunLifecycleScripts = true;
  };
in
bun2nix.mkDerivation (
  finalAttrs:
  common
  // {
    src = lib.fileset.toSource {
      inherit root;
      fileset = lib.fileset.unions (
        [
          (root + "/package.json")
          (root + "/bun.lock")
          # names @sammysul's registry, which bun's cache paths include
          (root + "/.npmrc")
          (root + "/tsconfig.json")
          (root + "/vite.config.ts")
          (root + "/src")
        ]
        ++ files
      );
    };

    # the whole project, so `bun run check` and `test` see what the dev shell sees
    passthru.tests.check = bun2nix.mkDerivation (
      common
      // {
        pname = "${finalAttrs.pname}-check";
        src = root;
        nativeBuildInputs = [ biome ];
        buildPhase = "bun run check && bun run test";
        installPhase = "touch $out";
      }
    );
  }
  // lib.toFunction args finalAttrs
)
