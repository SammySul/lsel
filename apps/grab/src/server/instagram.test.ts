import { expect, test } from "bun:test";
import { type FakeProfile, fakeInstagram, WORLD } from "./fakeInstagram.ts";
import { cdnUrl, Instagram } from "./instagram.ts";

function setup() {
  const fake = fakeInstagram(WORLD);
  let clock = 1_800_000_000_000;
  const ig = new Instagram({ fetch: fake.fetch, now: () => clock, gap: 0, retryWait: 0 });
  return { fake, ig, later: (minutes: number) => (clock += minutes * 60_000) };
}

test("a profile: the page's twelve in grid order, each post's files, dates from the embed's six", async () => {
  const { fake, ig } = setup();
  const p = await ig.profile("nat.geo");
  expect([p.username, p.fullName, p.verified, p.followers, p.postCount, p.missing]).toEqual([
    "nat.geo",
    "National Geo",
    true,
    267_196_027,
    800,
    0,
  ]);
  expect(p.posts.map((x) => [x.code, x.media.length, x.takenAt])).toEqual([
    ["Pin_ned-1", 1, 1_792_249_200_000],
    ["Car-ousel2", 3, 1_795_705_200_000],
    ["Reel_3", 1, 1_795_618_800_000],
    ["Photo4", 1, 1_795_532_400_000],
    ["Photo5", 1, 1_795_446_000_000],
    ["Photo6", 1, 1_795_359_600_000],
    ["Photo7", 1, null],
    ["Photo8", 1, null],
  ]);
  expect(p.posts[1]?.media.map((m) => [m.id, m.kind, m.width])).toEqual([
    ["Car-ousel2.1", "image", 1080],
    ["Car-ousel2.2", "image", 2048],
    ["Car-ousel2.3", "video", 1080],
  ]);
  expect(fake.state.calls.slice(0, 2)).toEqual(["/nat.geo/embed/", "/nat.geo/"]);
  expect(fake.state.calls.length).toBe(10);
});

test("a profile is kept 6 hours, its posts an hour: after, the profile and its posts are asked again", async () => {
  const { fake, ig, later } = setup();
  await Promise.all([ig.profile("nat.geo"), ig.profile("nat.geo")]);
  expect(fake.state.calls.length).toBe(10);
  later(359);
  await ig.profile("nat.geo");
  expect(fake.state.calls.length).toBe(10);
  later(2);
  await ig.profile("nat.geo");
  expect(fake.state.calls.slice(10)).toEqual([
    "/nat.geo/embed/",
    "/nat.geo/",
    ...["Pin_ned-1", "Car-ousel2", "Reel_3", "Photo4", "Photo5", "Photo6", "Photo7", "Photo8"].map(
      (c) => `/p/${c}/embed/captioned/`,
    ),
  ]);
});

test("a forgotten profile is asked again within the hour, its posts still from the cache", async () => {
  const world = structuredClone(WORLD);
  const fake = fakeInstagram(world);
  let clock = 1_800_000_000_000;
  const ig = new Instagram({ fetch: fake.fetch, now: () => clock, gap: 0, retryWait: 0 });
  await ig.profile("nat.geo");
  (world["nat.geo"] as FakeProfile).followers = 300_000_000;
  clock += 30 * 60_000;
  expect((await ig.profile("nat.geo")).followers).toBe(267_196_027);
  ig.forget("nat.geo");
  expect([ig.known("nat.geo"), (await ig.profile("nat.geo")).followers]).toEqual([
    false,
    300_000_000,
  ]);
  expect(fake.state.calls.slice(10)).toEqual(["/nat.geo/embed/", "/nat.geo/"]);
});

test("a post whose embed is gone is counted; a profile with no posts asks for nothing more", async () => {
  const { fake, ig } = setup();
  const patchy = await ig.profile("patchy");
  expect([patchy.posts.map((p) => p.code), patchy.missing]).toEqual([["Fine1"], 1]);
  fake.state.calls.length = 0;
  const quiet = await ig.profile("quiet");
  expect([quiet.posts, fake.state.calls]).toEqual([[], ["/quiet/embed/"]]);
});

test("Instagram's refusals each say what happened", async () => {
  const { fake, ig } = setup();
  const failure = (username: string) =>
    ig.profile(username).then(
      () => "loaded",
      (e: Error & { kind?: string }) => `${e.kind}: ${e.message}`,
    );
  expect(await failure("ghost")).toBe("not-found: Instagram has no public profile called ghost");
  fake.state.fail = 429;
  expect(await failure("nat.geo")).toBe(
    "rate-limited: Instagram is rate limiting; try again in a few minutes",
  );
  fake.state.fail = undefined;
  fake.state.refuse = Number.POSITIVE_INFINITY;
  expect(await failure("nat.geo")).toBe(
    "login: Instagram wants a login from this server for now; try again in a few minutes",
  );
  fake.state.refuse = 0;
  fake.state.fail = 503;
  expect(await failure("nat.geo")).toBe("unavailable: Instagram answered 503");
});

test("a rate limit stops the loading: what came is shown, flagged and kept until forgotten, then only the rest is asked for", async () => {
  const { fake, ig } = setup();
  fake.state.limitAfter = 3;
  const cut = await ig.profile("nat.geo");
  expect([cut.posts.map((p) => p.code), cut.missing, cut.limited]).toEqual([
    ["Pin_ned-1", "Car-ousel2", "Reel_3"],
    5,
    true,
  ]);
  // the fourth was refused three times, and nothing after it was asked for
  expect(fake.state.calls.slice(5)).toEqual([
    "/p/Photo4/embed/captioned/",
    "/p/Photo4/embed/captioned/",
    "/p/Photo4/embed/captioned/",
  ]);
  fake.state.limitAfter = undefined;
  fake.state.calls.length = 0;
  expect((await ig.profile("nat.geo")).limited).toBe(true);
  expect(fake.state.calls).toEqual([]);
  ig.forget("nat.geo");
  const whole = await ig.profile("nat.geo");
  expect([whole.posts.length, whole.missing, whole.limited]).toEqual([8, 0, false]);
  expect(fake.state.calls).toEqual([
    "/nat.geo/embed/",
    "/nat.geo/",
    ...["Photo4", "Photo5", "Photo6", "Photo7", "Photo8"].map((c) => `/p/${c}/embed/captioned/`),
  ]);
});

test("refused from the first post, the profile is an error, not an empty one", async () => {
  const { fake, ig } = setup();
  fake.state.limitAfter = 0;
  const e = await ig.profile("nat.geo").catch((x: Error & { kind: string }) => x);
  expect(e instanceof Error ? [e.kind, e.message] : e).toEqual([
    "login",
    "Instagram wants a login from this server for now; try again in a few minutes",
  ]);
});

test("requests go one at a time, each the gap after the one before, two profiles' loads included", async () => {
  const fake = fakeInstagram(WORLD);
  let clock = 0;
  const starts: [number, string][] = [];
  let open = 0;
  let most = 0;
  const ig = new Instagram({
    gap: 40,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    fetch: async (url, init) => {
      starts.push([clock, new URL(url).pathname]);
      most = Math.max(most, ++open);
      await Bun.sleep(1);
      clock += 5;
      open--;
      return fake.fetch(url, init);
    },
  });
  await Promise.all([ig.profile("patchy"), ig.profile("quiet")]);
  expect([starts, most]).toEqual([
    [
      [0, "/patchy/embed/"],
      [40, "/quiet/embed/"],
      [80, "/patchy/"],
      [120, "/p/Fine1/embed/captioned/"],
      [160, "/p/Gone2/embed/captioned/"],
    ],
    1,
  ]);
});

test("a page the rate limit refuses once or twice is asked for again and loads", async () => {
  const { fake, ig } = setup();
  fake.state.refuse = 2;
  const p = await ig.profile("nat.geo");
  expect([p.posts.length, p.missing, p.limited]).toEqual([8, 0, false]);
  expect(fake.state.calls.slice(0, 3)).toEqual([
    "/nat.geo/embed/",
    "/nat.geo/embed/",
    "/nat.geo/embed/",
  ]);
});

test("a snapshot comes back with the posts in so far and how many are pending, then whole", async () => {
  const fake = fakeInstagram(WORLD);
  const ig = new Instagram({ fetch: fake.fetch, gap: 20, retryWait: 0 });
  const first = await ig.snapshot("nat.geo", 0);
  expect([first.fullName, first.posts.length + first.pending, first.pending > 0]).toEqual([
    "National Geo",
    8,
    true,
  ]);
  const whole = await ig.snapshot("nat.geo", 1000);
  expect([whole.posts.length, whole.pending, whole.missing]).toEqual([8, 0, 0]);
  // the same load: nothing was asked for twice
  expect(fake.state.calls.length).toBe(10);
});

test("a poll after a cut-short load has ended gets that profile back without asking Instagram again", async () => {
  const fake = fakeInstagram(WORLD);
  const ig = new Instagram({ fetch: fake.fetch, gap: 5, retryWait: 0 });
  fake.state.limitAfter = 2;
  const first = await ig.snapshot("nat.geo", 0);
  expect([first.pending > 0, first.limited]).toEqual([true, false]);
  await ig.peek("nat.geo")?.whole;
  const calls = fake.state.calls.length;
  const after = await ig.snapshot("nat.geo", 0);
  expect([after.posts.length, after.missing, after.pending, after.limited]).toEqual([
    2,
    6,
    0,
    true,
  ]);
  expect([ig.known("nat.geo"), fake.state.calls.length - calls]).toEqual([true, 0]);
});

test("a refused profile page leaves the embed's six, cut short; a page that lists none, the six as they are", async () => {
  const fake = fakeInstagram(WORLD);
  // without its navigation headers the profile page redirects to the login, as the rate limit does
  const refused = new Instagram({
    fetch: (url, init) => fake.fetch(url, url.endsWith("/nat.geo/") ? {} : init),
    gap: 0,
    retryWait: 0,
  });
  const cut = await refused.profile("nat.geo");
  expect([cut.posts.map((p) => p.code), cut.missing, cut.pending, cut.limited]).toEqual([
    ["Pin_ned-1", "Car-ousel2", "Reel_3", "Photo4", "Photo5", "Photo6"],
    6,
    0,
    true,
  ]);
  const empty = new Instagram({
    fetch: (url, init) =>
      url.endsWith("/nat.geo/")
        ? Promise.resolve(new Response("<html></html>"))
        : fake.fetch(url, init),
    gap: 0,
    retryWait: 0,
  });
  const six = await empty.profile("nat.geo");
  expect([six.posts.length, six.missing, six.limited]).toEqual([6, 0, false]);
});

test("peek never starts a load", async () => {
  const { fake, ig } = setup();
  expect(ig.peek("nat.geo")).toBeUndefined();
  await Bun.sleep(5);
  expect([ig.known("nat.geo"), fake.state.calls]).toEqual([false, []]);
  const loading = ig.snapshot("nat.geo", 0);
  expect((await ig.peek("nat.geo")?.now)?.fullName).toBe("National Geo");
  await loading;
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
