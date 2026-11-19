# The web app (vite build) and the server (one compiled binary) from the workspace root.
{
  lib,
  stdenv,
  bun2nix,
  makeBinaryWrapper,
}:
let
  root = ../.;
  packageJson = lib.importJSON (root + "/package.json");
  # `bun patch` records its patches here; bun2nix applies them to the cached packages.
  patchedDependencies = lib.mapAttrs (_: path: root + "/${path}") (
    packageJson.patchedDependencies or { }
  );
in
stdenv.mkDerivation {
  pname = "yank-wars";
  inherit (packageJson) version;

  src = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      (root + "/package.json")
      (root + "/bun.lock")
      # names @sammysul's registry, which bun's cache paths include
      (root + "/.npmrc")
      (root + "/bunfig.toml")
      (root + "/tsconfig.json")
      (root + "/patches")
      (root + "/puzzles")
      (root + "/packages")
      (root + "/apps")
    ];
  };

  nativeBuildInputs = [
    bun2nix.hook
    makeBinaryWrapper
  ];

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = root + "/bun.nix";
    overrides = bun2nix.patchedDependenciesToOverrides { inherit patchedDependencies; };
  };

  postBunSetInstallCacheDirPhase = builtins.readFile ./bun-cache-alias.sh;

  # the root postinstall wants the dev shell's bun2nix; no dependency here has install scripts
  dontRunLifecycleScripts = true;

  buildPhase = ''
    runHook preBuild
    bun run build
    bun build --compile --minify --sourcemap apps/server/src/main.ts --outfile yank-wars
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin $out/libexec $out/share/yank-wars
    cp yank-wars $out/libexec/yank-wars
    cp -R apps/web/dist $out/share/yank-wars/web
    makeBinaryWrapper $out/libexec/yank-wars $out/bin/yank-wars \
      --set-default YW_STATIC $out/share/yank-wars/web
    runHook postInstall
  '';

  # strip and patchelf would break the payload `bun build --compile` appends to the binary
  dontFixup = true;

  meta.mainProgram = "yank-wars";
}
