# One workspace member as a web app: its page (Vite) and its server (one compiled binary).
{
  lib,
  makeBinaryWrapper,
  root,
  member,
}:
{
  name,
  # the member's directory, relative to the repo root
  dir,
  # the app reads <prefix>_STATIC, _HOST and _PORT
  prefix ? lib.toUpper (lib.replaceStrings [ "-" ] [ "_" ] name),
  # relative to dir
  server ? "src/server/main.ts",
  # more entrypoints compiled into the binary, such as a Worker's script; relative to dir
  workers ? [ ],
  web ? "dist",
  checkInputs ? [ ],
}:
let
  files = [
    (root + "/kit/src")
    (root + "/kit/config")
    (root + "/kit/tsconfig.json")
    (root + "/${dir}")
  ];
  inherit ((lib.importJSON (root + "/${dir}/package.json"))) version;
in
member files {
  pname = name;
  inherit version;
  nativeBuildInputs = [ makeBinaryWrapper ];

  buildPhase = ''
    runHook preBuild
    cd ${dir}
    bun run build
    bun build --compile --minify --sourcemap ${
      lib.escapeShellArgs ([ server ] ++ workers)
    } --outfile ${name}
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
  passthru.tests.check = member files {
    pname = "${name}-check";
    inherit version;
    nativeBuildInputs = checkInputs;
    buildPhase = ''
      cd ${dir}
      bun run check
      bun run test
    '';
    installPhase = "touch $out";
  };
}
