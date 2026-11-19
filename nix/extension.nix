{
  lib,
  bunProject,
  root,
}:
bunProject root
  [
    (root + "/manifest.json")
    # icons and other files Vite copies as they are
    (lib.fileset.maybeMissing (root + "/public"))
  ]
  {
    buildPhase = ''
      runHook preBuild
      bun run build
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      cp -R dist $out
      runHook postInstall
    '';
  }
