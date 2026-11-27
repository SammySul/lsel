import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rateLimiter } from "@sammysul/lsel/server";
import { api } from "./api.ts";
import { cdn, fakeInstagram, fileBytes, WORLD } from "./fakeInstagram.ts";
import { Instagram } from "./instagram.ts";

function setup(allow?: (visitor: string, now: number) => boolean) {
  const fake = fakeInstagram(WORLD);
  const routes = api({
    instagram: new Instagram({ fetch: fake.fetch, gap: 0, retryWait: 0 }),
    ...(allow === undefined ? {} : { allow }),
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
  expect(await body(await get("/api/profile/%E0"))).toEqual([
    400,
    { error: "%E0 isn't an Instagram username: letters, numbers, . and _" },
  ]);
  expect(await body(await get("/api/zip/%E0?ids=picture"))).toEqual([
    400,
    { error: "%E0 isn't an Instagram username: letters, numbers, . and _" },
  ]);
});

test("a cut-short profile stays for the page's polls; ?retry loads the rest, counted as a new profile", async () => {
  let asked = 0;
  const { fake, get } = setup(() => {
    asked++;
    return true;
  });
  fake.state.limitAfter = 3;
  const cut = await (await get("/api/profile/nat.geo")).json();
  expect([cut.posts.length, cut.missing, cut.limited, asked]).toEqual([3, 5, true, 1]);
  const calls = fake.state.calls.length;
  const polled = await (await get("/api/profile/nat.geo")).json();
  expect([polled.posts.length, polled.limited, asked, fake.state.calls.length - calls]).toEqual([
    3,
    true,
    1,
    0,
  ]);
  fake.state.limitAfter = undefined;
  const whole = await (await get("/api/profile/nat.geo?retry")).json();
  expect([whole.posts.length, whole.missing, whole.limited, asked]).toEqual([8, 0, false, 2]);
  expect(fake.state.calls.slice(calls)).toEqual([
    "/nat.geo/embed/",
    "/nat.geo/",
    ...["Photo4", "Photo5", "Photo6", "Photo7", "Photo8"].map((c) => `/p/${c}/embed/captioned/`),
  ]);
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
  await get("/api/profile/nat.geo");
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
    "2026-11-26 Car-ousel2/nat.geo_Car-ousel2_3.mp4",
    "2026-11-24 Photo4/nat.geo_Photo4_1.jpg",
  ]);
  const photo = Bun.spawnSync([
    "unzip",
    "-p",
    path,
    "2026-11-24 Photo4/nat.geo_Photo4_1.jpg",
  ]).stdout;
  expect(Buffer.compare(photo, Buffer.from(fileBytes("/v/t51.82787-15/Photo4_1.jpg")))).toBe(0);

  fake.state.expired = true;
  const broken = await get("/api/zip/nat.geo?ids=Photo4.1");
  writeFileSync(path, new Uint8Array(await broken.arrayBuffer()));
  expect(Bun.spawnSync(["unzip", "-p", path, "MISSING.txt"]).stdout.toString()).toBe(
    "Instagram didn't send these:\n2026-11-24 Photo4/nat.geo_Photo4_1.jpg: Instagram's link to this file has expired; reload the profile\n",
  );
});

test("a zip of nothing, of a profile not loaded, or of a file the profile doesn't have, is refused", async () => {
  const { fake, get } = setup();
  expect(await body(await get("/api/zip/nat.geo"))).toEqual([
    400,
    { error: "choose at least one file" },
  ]);
  expect(await body(await get("/api/zip/nat.geo?ids=picture"))).toEqual([
    409,
    { error: "Reload the profile first" },
  ]);
  expect(fake.state.calls).toEqual([]);
  await get("/api/profile/nat.geo");
  expect(await body(await get("/api/zip/nat.geo?ids=Photo4.1,Nope.1"))).toEqual([
    400,
    { error: "not in nat.geo's recent posts: Nope.1" },
  ]);
});

test("a visitor may start only so many new profiles a minute; a cached one and another visitor still get through", async () => {
  const { get } = setup(rateLimiter(2));
  const status = async (username: string, ip: string) =>
    (await get(`/api/profile/${username}`, { "cf-connecting-ip": ip })).status;
  expect([
    await status("nat.geo", "203.0.113.7"),
    await status("quiet", "203.0.113.7"),
    await status("patchy", "203.0.113.7"),
    await status("nat.geo", "203.0.113.7"),
    await status("patchy", "198.51.100.2"),
  ]).toEqual([200, 200, 429, 200, 200]);
});

test("a retry the visitor's limit refuses keeps the cut-short profile for the next poll", async () => {
  let left = 1;
  const { fake, get } = setup(() => left-- > 0);
  fake.state.limitAfter = 3;
  await get("/api/profile/nat.geo");
  const refused = await get("/api/profile/nat.geo?retry");
  const kept = await (await get("/api/profile/nat.geo")).json();
  expect([refused.status, kept.posts.length, kept.limited]).toEqual([429, 3, true]);
});
