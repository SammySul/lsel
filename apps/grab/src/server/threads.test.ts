import { expect, test } from "bun:test";
import type { Media } from "../shared/types.ts";
import { type FakeProfile, fakeInstagram, threadsPage, WORLD } from "./fakeInstagram.ts";
import { parseThreadsPicture, Threads } from "./threads.ts";

const natGeo = WORLD["nat.geo"] as FakeProfile;
const CDN = "https://scontent-fra5-1.cdninstagram.com/v/t51.82787-19";

test("parseThreadsPicture: the largest version, whichever order Threads lists them in", () => {
  const largest: Media = {
    id: "picture",
    kind: "image",
    width: 640,
    height: 640,
    src: `${CDN}/nat.geo_pic.jpg?oe=6930A1B2`,
    thumb: `${CDN}/nat.geo_pic.jpg?oe=6930A1B2`,
    duration: null,
  };
  expect(parseThreadsPicture(threadsPage("nat.geo", natGeo), "nat.geo")).toEqual(largest);
  expect(parseThreadsPicture(threadsPage("nat.geo", natGeo, [640, 320]), "nat.geo")).toEqual(
    largest,
  );
  expect(parseThreadsPicture(threadsPage("nat.geo", natGeo, [320, 1080, 640]), "nat.geo")).toEqual({
    ...largest,
    width: 1080,
    height: 1080,
    src: `${CDN}/nat.geo_pic.jpg?oe=6930A1B2`,
    thumb: `${CDN}/nat.geo_pic.jpg?stp=dst-jpg_s640x640_tt6&oe=6930A1B2`,
  });
});

test("parseThreadsPicture: someone else's page, a changed shape and a page without it each say so", () => {
  expect(() => parseThreadsPicture(threadsPage("nat.geo", natGeo), "quiet")).toThrow(
    "Threads' page has no picture for quiet",
  );
  const renamed = threadsPage("nat.geo", natGeo).replaceAll('"url":', '"uri":');
  expect(() => parseThreadsPicture(renamed, "nat.geo")).toThrow(
    'Threads\' user has an unexpected shape at hd_profile_pic_versions.0.url: Invalid key: Expected "url" but received undefined',
  );
  const elsewhere = threadsPage("nat.geo", natGeo).replaceAll("cdninstagram.com", "example.com");
  expect(() => parseThreadsPicture(elsewhere, "nat.geo")).toThrow(
    "Threads' user has an unexpected shape at hd_profile_pic_versions.0.url: not on Instagram's CDN",
  );
  expect(() => parseThreadsPicture("<html></html>", "nat.geo")).toThrow(
    "Threads' page has no hd_profile_pic_versions",
  );
});

test("a profile Threads lacks, redirects, rate limits or doesn't answer in time is null", async () => {
  const fake = fakeInstagram(WORLD);
  const threads = new Threads({ fetch: fake.fetch, gap: 0 });
  expect((await threads.picture("nat.geo"))?.width).toBe(640);
  expect(await threads.picture("patchy")).toBeNull();
  fake.state.threads = 302;
  expect(await threads.picture("nat.geo")).toBeNull();
  fake.state.threads = 429;
  expect(await threads.picture("nat.geo")).toBeNull();
  expect(fake.state.threadsCalls).toEqual(["/@nat.geo", "/@patchy", "/@nat.geo", "/@nat.geo"]);
  const hung = new Threads({
    gap: 0,
    timeout: 20,
    fetch: (_url, init) =>
      new Promise((_, reject) =>
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
      ),
  });
  expect(await hung.picture("nat.geo")).toBeNull();
});
