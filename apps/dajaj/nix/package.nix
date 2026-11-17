# The web app (vite build) and the server (one compiled binary).
{
  lib,
  stdenv,
  bun2nix,
  makeBinaryWrapper,
}:
let
  root = ../.;
  packageJson = lib.importJSON (root + "/package.json");
  # the one name: package.json's. `my-app` gets the env prefix `MY_APP`, as `src/server/config.ts` reads it.
  pname = packageJson.name;
  prefix = lib.toUpper (lib.replaceStrings [ "-" ] [ "_" ] pname);
in
stdenv.mkDerivation {
  inherit pname;
  inherit (packageJson) version;

  src = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      (root + "/package.json")
      (root + "/bun.lock")
      (root + "/tsconfig.json")
      (root + "/svelte.config.js")
      (root + "/vite.config.ts")
      (root + "/src")
    ];
  };

  nativeBuildInputs = [
    bun2nix.hook
    makeBinaryWrapper
  ];

  bunDeps = bun2nix.fetchBunDeps { bunNix = root + "/bun.nix"; };

  # the postinstall wants the dev shell's bun2nix; no dependency here has install scripts
  dontRunLifecycleScripts = true;

  buildPhase = ''
    runHook preBuild
    bun run build
    bun build --compile --minify --sourcemap src/server/main.ts --outfile ${pname}
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin $out/libexec $out/share/${pname}
    cp ${pname} $out/libexec/${pname}
    cp -R dist $out/share/${pname}/web
    makeBinaryWrapper $out/libexec/${pname} $out/bin/${pname} \
      --set-default ${prefix}_STATIC $out/share/${pname}/web
    runHook postInstall
  '';

  # strip and patchelf would break the payload `bun build --compile` appends to the binary
  dontFixup = true;

  meta.mainProgram = pname;
}
