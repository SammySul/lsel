# lsel-touched: a --filter per member whose browser tests a CI run needs, from the diff since main's last green browsers job.
everything=(./kit ./templates/web)
for dir in apps/*/; do everything+=("./${dir%/}"); done

api="$GITHUB_SERVER_URL/api/v1/repos/$GITHUB_REPOSITORY/actions/tasks?limit=50"
base=$(curl -fsS -H "Authorization: token $TOKEN" "$api" |
  jq -r 'first(.workflow_runs[] | select(.name == "browsers" and .status == "success" and .head_branch == "main")) | .head_sha' ||
  true)

# no green run to start from, or not in this clone: every member
if [ -z "$base" ] || ! changed=$(git diff --name-only "$base" HEAD 2>/dev/null); then
  changed=kit/
fi

members=()
while read -r path; do
  case $path in
  bun.lock)
    # a release bumps its member's version here too, which its own package.json already covers
    locked=$(git diff -U0 "$base" HEAD -- bun.lock | grep '^[-+] ' | grep -v '^[-+] *"version": ' || true)
    if [ -n "$locked" ]; then
      members=("${everything[@]}")
      break
    fi
    ;;
  kit/* | theme/* | nix/* | patches/* | flake.* | package.json | bun.nix | .forgejo/*)
    members=("${everything[@]}")
    break
    ;;
  templates/web/* | apps/*/*)
    IFS=/ read -r top name _ <<<"$path"
    if [ -f "$top/$name/package.json" ]; then members+=("./$top/$name"); fi
    ;;
  esac
done <<<"$changed"

for member in $(printf '%s\n' "${members[@]}" | sort -u); do printf -- '--filter %s ' "$member"; done
