# A derivation over one workspace member: the lockfile, every manifest and `files` as its source.
{
  lib,
  bun2nix,
  root,
  bunDeps,
  assets,
}:
files: args:
bun2nix.mkDerivation (
  finalAttrs:
  {
    inherit bunDeps;
    # a flake's root holds only tracked files, so no node_modules package.json gets in
    src = lib.fileset.toSource {
      inherit root;
      fileset = lib.fileset.unions (
        [
          (root + "/bun.lock")
          (root + "/patches")
          # every member's manifest, so the install sees the workspace bun.lock describes
          (lib.fileset.fileFilter (f: f.name == "package.json") root)
        ]
        ++ files
      );
    };
    # the root postinstall wants the dev shell's bun2nix and nix; no dependency has install scripts
    dontRunLifecycleScripts = true;
    # the dev shell's postinstall writes them; here they come from the flake
    postPatch = ''
      cp -R ${assets} kit/src/lib/assets
      chmod -R u+w kit/src/lib/assets
    '';
  }
  // lib.toFunction args finalAttrs
)
