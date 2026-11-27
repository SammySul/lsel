import { expect, test } from "bun:test";
import { fakeInstagram, WORLD } from "./fakeInstagram.ts";
import { Instagram } from "./instagram.ts";

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
  expect(p.posts.map((x) => [x.code, x.kind, x.media.length, x.takenAt])).toEqual([
    ["Pin_ned-1", "image", 1, 1_792_249_200_000],
    ["Car-ousel2", "carousel", 3, 1_795_705_200_000],
    ["Reel_3", "video", 1, 1_795_618_800_000],
    ["Photo4", "image", 1, 1_795_532_400_000],
    ["Photo5", "image", 1, 1_795_446_000_000],
    ["Photo6", "image", 1, 1_795_359_600_000],
    ["Photo7", "image", 1, null],
    ["Photo8", "image", 1, null],
  ]);
  expect(p.posts[1]?.media.map((m) => [m.id, m.kind, m.width])).toEqual([
    ["Car-ousel2.1", "image", 1080],
    ["Car-ousel2.2", "image", 2048],
    ["Car-ousel2.3", "video", 1080],
  ]);
  expect(fake.state.calls.slice(0, 2)).toEqual(["/nat.geo/embed/", "/nat.geo/"]);
  expect(fake.state.calls.length).toBe(10);
});

test("within 10 minutes the profile is cached; after, only the profile is asked again, not the posts", async () => {
  const { fake, ig, later } = setup();
  await Promise.all([ig.profile("nat.geo"), ig.profile("nat.geo")]);
  expect(fake.state.calls.length).toBe(10);
  later(9);
  await ig.profile("nat.geo");
  expect(fake.state.calls.length).toBe(10);
  later(2);
  await ig.profile("nat.geo");
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
  fake.state.login = true;
  expect(await failure("nat.geo")).toBe(
    "login: Instagram wants a login from this server for now; try again in a few minutes",
  );
  fake.state.login = false;
  fake.state.fail = 503;
  expect(await failure("nat.geo")).toBe("unavailable: Instagram answered 503");
});

test("a rate limit stops the loading: what came is shown, flagged, not kept, and a retry asks only for the rest", async () => {
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

test("requests go one at a time, each at least the gap after the one before", async () => {
  const fake = fakeInstagram(WORLD);
  const starts: number[] = [];
  let open = 0;
  let most = 0;
  const ig = new Instagram({
    gap: 40,
    fetch: async (url, init) => {
      starts.push(performance.now());
      most = Math.max(most, ++open);
      await Bun.sleep(5);
      open--;
      return fake.fetch(url, init);
    },
  });
  await ig.profile("patchy");
  const gaps = starts.slice(1).map((t, i) => t - (starts[i] as number));
  expect([starts.length, most, gaps.every((g) => g >= 39)]).toEqual([4, 1, true]);
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
