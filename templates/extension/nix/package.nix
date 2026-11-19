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
      # names @sammysul's registry, which bun's cache paths include
      (root + "/.npmrc")
      # the test preload
      (root + "/bunfig.toml")
      (root + "/tsconfig.json")
      (root + "/vite.config.ts")
      (root + "/src")
      (lib.fileset.maybeMissing (root + "/tests"))
      # icons and other files Vite copies as they are
      (lib.fileset.maybeMissing (root + "/public"))
    ];
  };

  nativeBuildInputs = [ bun2nix.hook ];

  bunDeps = bun2nix.fetchBunDeps { bunNix = root + "/bun.nix"; };

  # bun 1.4 names a registry with a path `<host>__<Wyhash11 of its URL>` in its cache; bun2nix
  # 2.1.2 writes only `<host>`. 384c46f8dbebcd65 is that hash of @sammysul's registry URL.
  postBunSetInstallCacheDirPhase = ''
    for entry in "$BUN_INSTALL_CACHE_DIR"/@sammysul/*@@git.sammysul.com@@@1; do
      [ -e "$entry" ] || continue
      chmod u+w "$(dirname "$entry")"
      ln -s "$(basename "$entry")" "''${entry%@@@1}__384c46f8dbebcd65@@@1"
    done
  '';

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
