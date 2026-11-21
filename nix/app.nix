# One workspace member as a web app: its page (Vite) and its server (one compiled binary).
{
  lib,
  bun2nix,
  makeBinaryWrapper,
  root,
  bunDeps,
  assets,
}:
{
  name,
  # the member's directory, relative to the repo root
  dir,
  # the app reads <prefix>_STATIC, _HOST and _PORT
  prefix ? lib.toUpper (lib.replaceStrings [ "-" ] [ "_" ] name),
  # relative to dir
  server ? "src/server/main.ts",
  web ? "dist",
  checkInputs ? [ ],
}:
let
  common = {
    inherit bunDeps;
    # a flake's root holds only tracked files, so no node_modules package.json gets in
    src = lib.fileset.toSource {
      inherit root;
      fileset = lib.fileset.unions [
        (root + "/bun.lock")
        (root + "/patches")
        # every member's manifest, so the install sees the workspace bun.lock describes
        (lib.fileset.fileFilter (f: f.name == "package.json") root)
        (root + "/kit/src")
        (root + "/kit/config")
        (root + "/kit/tsconfig.json")
        (root + "/${dir}")
      ];
    };
    # the root postinstall wants the dev shell's bun2nix and nix; no dependency has install scripts
    dontRunLifecycleScripts = true;
    # the dev shell's postinstall writes them; here they come from the flake
    postPatch = ''
      cp -R ${assets} kit/src/lib/assets
      chmod -R u+w kit/src/lib/assets
    '';
  };
in
bun2nix.mkDerivation (
  finalAttrs:
  common
  // {
    pname = name;
    inherit ((lib.importJSON (root + "/${dir}/package.json"))) version;
    nativeBuildInputs = [ makeBinaryWrapper ];

    buildPhase = ''
      runHook preBuild
      cd ${dir}
      bun run build
      bun build --compile --minify --sourcemap ${server} --outfile ${name}
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out/bin $out/libexec $out/share/${name}
      cp ${name} $out/libexec/${name}
      cp -R ${web} $out/share/${name}/web
      makeBinaryWrapper $out/libexec/${name} $out/bin/${name} \
        --set-default ${prefix}_STATIC $out/share/${name}/web
      runHook postInstall
    '';

    # strip and patchelf would break the payload `bun build --compile` appends to the binary
    dontFixup = true;

    meta.mainProgram = name;

    # `bun run check` and `test`, as in the dev shell
    passthru.tests.check = bun2nix.mkDerivation (
      common
      // {
        pname = "${name}-check";
        inherit (finalAttrs) version;
        nativeBuildInputs = checkInputs;
        buildPhase = ''
          cd ${dir}
          bun run check
          bun run test
        '';
        installPhase = "touch $out";
      }
    );
  }
)
