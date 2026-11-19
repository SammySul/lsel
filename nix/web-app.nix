{
  lib,
  bunProject,
  makeBinaryWrapper,
  root,
}:
bunProject root [ (root + "/svelte.config.js") ] (finalAttrs: {
  nativeBuildInputs = [ makeBinaryWrapper ];

  buildPhase = ''
    runHook preBuild
    bun run build
    bun build --compile --minify --sourcemap src/server/main.ts --outfile ${finalAttrs.pname}
    runHook postBuild
  '';

  # `my-app` reads MY_APP_STATIC, as `serve()` takes its env prefix from the name
  installPhase =
    let
      name = finalAttrs.pname;
      prefix = lib.toUpper (lib.replaceStrings [ "-" ] [ "_" ] name);
    in
    ''
      runHook preInstall
      mkdir -p $out/bin $out/libexec $out/share/${name}
      cp ${name} $out/libexec/${name}
      cp -R dist $out/share/${name}/web
      makeBinaryWrapper $out/libexec/${name} $out/bin/${name} \
        --set-default ${prefix}_STATIC $out/share/${name}/web
      runHook postInstall
    '';

  # strip and patchelf would break the payload `bun build --compile` appends to the binary
  dontFixup = true;
})
