# bun caches a registry with a path as `<host>__<Wyhash11 of its URL>`, bun2nix only as `<host>` (README.md).
for entry in "$BUN_INSTALL_CACHE_DIR"/@sammysul/*@@git.sammysul.com@@@1; do
  [ -e "$entry" ] || continue
  chmod u+w "$(dirname "$entry")"
  ln -s "$(basename "$entry")" "${entry%@@@1}__384c46f8dbebcd65@@@1"
done
