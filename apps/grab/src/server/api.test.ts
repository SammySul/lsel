import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api, cdnUrl } from "./api.ts";
import { cdn, fakeInstagram, fileBytes, WORLD } from "./fakeInstagram.ts";
import { Instagram } from "./instagram.ts";

function setup() {
  const fake = fakeInstagram(WORLD);
  const routes = api({
    instagram: new Instagram({ fetch: fake.fetch, gap: 0, retryWait: 0 }),
    fetch: fake.fetch,
  });
  const get = async (path: string, headers: Record<string, string> = {}) => {
    const url = new URL(`http://grab.test${path}`);
    const res = await routes(new Request(url, { headers }), url);
    if (res === undefined) throw new Error(`${path} fell through`);
    return res;
  };
  return { fake, get };
}

const body = async (res: Response) => [res.status, await res.json()];

test("a profile by any spelling people paste; a bad one says why", async () => {
  const { get } = setup();
  const res = await get(`/api/profile/${encodeURIComponent("@Nat.Geo")}`);
  const profile = await res.json();
  expect([res.status, profile.username, profile.posts.length]).toEqual([200, "nat.geo", 8]);
  expect(await body(await get("/api/profile/no%20spaces"))).toEqual([
    400,
    { error: "no spaces isn't an Instagram username: letters, numbers, . and _" },
  ]);
  expect(await body(await get("/api/profile/ghost"))).toEqual([
    404,
    { error: "Instagram has no public profile called ghost" },
  ]);
});

test("cdnUrl takes only https on Instagram's CDN hosts", () => {
  expect(
    [
      "https://scontent-fra5-1.cdninstagram.com/v/a.jpg",
      "https://video.xx.fbcdn.net/v/a.mp4",
      "http://scontent.cdninstagram.com/a.jpg",
      "https://cdninstagram.com.evil.test/a.jpg",
      "https://evilcdninstagram.com/a.jpg",
      "https://scontent.cdninstagram.com:8443/a.jpg",
      "file:///etc/passwd",
      "not a url",
    ].map((u) => cdnUrl(u) !== null),
  ).toEqual([true, true, false, false, false, false, false, false]);
});

test("media comes through with its type, as an attachment when named, and in ranges", async () => {
  const { get } = setup();
  const src = encodeURIComponent(cdn("Reel_3_1.mp4"));
  const whole = await get(`/api/media?src=${src}&name=nat.geo_Reel_3_1.mp4`);
  expect([
    whole.status,
    whole.headers.get("content-type"),
    whole.headers.get("content-disposition"),
    await whole.text(),
  ]).toEqual([
    200,
    "video/mp4",
    'attachment; filename="nat.geo_Reel_3_1.mp4"',
    "fake mp4 /v/t51.82787-15/Reel_3_1.mp4",
  ]);
  const part = await get(`/api/media?src=${src}`, { Range: "bytes=0-7" });
  expect([part.status, part.headers.get("content-range"), await part.text()]).toEqual([
    206,
    "bytes 0-7/37",
    "fake mp4",
  ]);
});

test("the proxy refuses other hosts and bad names, and says when a link expired", async () => {
  const { fake, get } = setup();
  const src = encodeURIComponent(cdn("Photo4_1.jpg"));
  expect(
    await body(await get(`/api/media?src=${encodeURIComponent("https://example.com/a.jpg")}`)),
  ).toEqual([400, { error: "not an Instagram CDN address" }]);
  expect((await get(`/api/media?src=${src}&name=../x`)).status).toBe(400);
  fake.state.expired = true;
  expect(await body(await get(`/api/media?src=${src}`))).toEqual([
    410,
    { error: "Instagram's link to this file has expired; reload the profile" },
  ]);
});

test("a zip of the chosen files, named for download; what the CDN refuses is listed inside", async () => {
  const { fake, get } = setup();
  const res = await get("/api/zip/nat.geo?ids=picture,Car-ousel2.3,Photo4.1");
  expect([res.status, res.headers.get("content-disposition")]).toEqual([
    200,
    'attachment; filename="nat.geo.zip"',
  ]);
  const path = join(mkdtempSync(join(tmpdir(), "grab-api-")), "a.zip");
  writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
  const names = Bun.spawnSync(["unzip", "-Z1", path]).stdout.toString().trim().split("\n");
  expect(names).toEqual([
    "nat.geo_picture.jpg",
    "nat.geo_Car-ousel2_3.mp4",
    "nat.geo_Photo4_1.jpg",
  ]);
  const photo = Bun.spawnSync(["unzip", "-p", path, "nat.geo_Photo4_1.jpg"]).stdout;
  expect(Buffer.compare(photo, Buffer.from(fileBytes("/v/t51.82787-15/Photo4_1.jpg")))).toBe(0);

  fake.state.expired = true;
  const broken = await get("/api/zip/nat.geo?ids=Photo4.1");
  writeFileSync(path, new Uint8Array(await broken.arrayBuffer()));
  expect(Bun.spawnSync(["unzip", "-p", path, "MISSING.txt"]).stdout.toString()).toBe(
    "Instagram didn't send these:\nnat.geo_Photo4_1.jpg: Instagram's CDN answered 403\n",
  );
});

test("a zip of nothing, or of a file the profile doesn't have, is refused", async () => {
  const { get } = setup();
  expect(await body(await get("/api/zip/nat.geo"))).toEqual([
    400,
    { error: "choose at least one file" },
  ]);
  expect(await body(await get("/api/zip/nat.geo?ids=Photo4.1,Nope.1"))).toEqual([
    400,
    { error: "not in nat.geo's recent posts: Nope.1" },
  ]);
});
