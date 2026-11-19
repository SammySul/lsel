# bun 1.4 names a registry with a path `<host>__<Wyhash11 of its URL>` in its cache; bun2nix 2.1.2
# writes only `<host>`. 384c46f8dbebcd65 is that hash of @sammysul's registry URL (.npmrc).
for entry in "$BUN_INSTALL_CACHE_DIR"/@sammysul/*@@git.sammysul.com@@@1; do
  [ -e "$entry" ] || continue
  chmod u+w "$(dirname "$entry")"
  ln -s "$(basename "$entry")" "${entry%@@@1}__384c46f8dbebcd65@@@1"
done
