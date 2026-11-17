# The unpacked extension (vite build), with the unit tests as its check.
{
  lib,
  stdenv,
  bun2nix,
}:
let
  root = ../.;
  packageJson = lib.importJSON (root + "/package.json");
in
stdenv.mkDerivation {
  pname = packageJson.name;
  inherit (packageJson) version;

  src = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      (root + "/manifest.json")
      (root + "/package.json")
      (root + "/bun.lock")
      (root + "/tsconfig.json")
      (root + "/vite.config.ts")
      (root + "/src")
      (root + "/tests")
      # icons and other files Vite copies as they are
      (lib.fileset.maybeMissing (root + "/public"))
    ];
  };

  nativeBuildInputs = [ bun2nix.hook ];

  bunDeps = bun2nix.fetchBunDeps { bunNix = root + "/bun.nix"; };

  # the postinstall wants the dev shell's bun2nix; no dependency here has install scripts
  dontRunLifecycleScripts = true;

  buildPhase = ''
    runHook preBuild
    bun run build
    runHook postBuild
  '';

  doCheck = true;

  checkPhase = ''
    runHook preCheck
    bun run test
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    cp -R dist $out
    runHook postInstall
  '';
}
