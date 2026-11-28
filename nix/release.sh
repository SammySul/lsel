# lsel-release <app dir>: in Forgejo Actions, on a full clone. A version without its <name>-v tag becomes a release.
dir=$1
if [ ! -f "$dir/package.json" ]; then
  echo "$dir has no package.json yet, so nothing to release"
  exit 0
fi
name=$(jq -r .name "$dir/package.json")
tag="$name-v$(jq -r .version "$dir/package.json")"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "$tag is already released"
  exit 0
fi
prev=$(git describe --tags --abbrev=0 --match "$name-v*" 2>/dev/null || true)
changes=$(git log --format='- %s' "${prev:+$prev..}HEAD" -- "$dir")
repo="$GITHUB_SERVER_URL/api/v1/repos/$GITHUB_REPOSITORY"

jq -n --arg tag "$tag" --arg sha "$GITHUB_SHA" --arg body "$changes" \
  '{tag_name: $tag, target_commitish: $sha, name: $tag, body: $body}' |
  curl -fsS -X POST -H "Authorization: token $TOKEN" -H "Content-Type: application/json" --data @- "$repo/releases" >/dev/null
echo "released $tag"
