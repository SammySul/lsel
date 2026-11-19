# lsel-release [<built extension>]: in Forgejo Actions, on a full clone (README.md).
tag="v$(jq -r .version package.json)"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "$tag is already released"
  exit 0
fi
prev=$(git describe --tags --abbrev=0 2>/dev/null || true)
changes=$(git log --format='- %s' "${prev:+$prev..}HEAD")
repo="$GITHUB_SERVER_URL/api/v1/repos/$GITHUB_REPOSITORY"

body=$changes
name=""
if [ $# -gt 0 ]; then
  name="$(jq -r .name package.json).zip"
  (cd "$1" && zip -qr "$OLDPWD/$name" .)
  body="## Install

1. Download \`$name\` below and unzip it
2. Open the browser's extensions page (\`chrome://extensions\`)
3. Turn on **Developer mode**, then **Load unpacked** and pick the unzipped folder

## Changes

$changes"
fi

id=$(jq -n --arg tag "$tag" --arg sha "$GITHUB_SHA" --arg body "$body" \
  '{tag_name: $tag, target_commitish: $sha, name: $tag, body: $body}' |
  curl -fsS -X POST -H "Authorization: token $TOKEN" -H "Content-Type: application/json" --data @- "$repo/releases" |
  jq -r .id)
if [ -n "$name" ] &&
  ! curl -fsS -X POST -H "Authorization: token $TOKEN" -F "attachment=@$name" "$repo/releases/$id/assets?name=$name" >/dev/null; then
  # a release without its zip would count as released: take it and its tag back so the next run tries again
  curl -fsS -X DELETE -H "Authorization: token $TOKEN" "$repo/releases/$id"
  curl -fsS -X DELETE -H "Authorization: token $TOKEN" "$repo/tags/$tag"
  echo "the upload failed; $tag is not released" >&2
  exit 1
fi
echo "released $tag${name:+ with $name}"
