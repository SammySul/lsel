import { describe, expect, test } from "bun:test";
import { cdn, embedPage, embedShell, fakeInstagram, WORLD } from "./fakeInstagram.ts";
import { contextJson, parsePost, parseProfileEmbed, profileCodes } from "./parse.ts";

const page = (literal: string) => embedShell(false, literal);

describe("contextJson", () => {
  test("reads the JSON inside the string, with escaped quotes, slashes and unicode", () => {
    const literal = String.raw`"{\"context\":{\"caption\":\"say \\\"hi\\\" \\u00e9\",\"url\":\"https:\\\/\\\/x.test\\\/a\"}}"`;
    expect(contextJson(page(literal))).toEqual({
      context: { caption: 'say "hi" é', url: "https://x.test/a" },
    });
  });

  test("a page without it, or with it cut short, has none", () => {
    expect(contextJson("<html>Page Not Found</html>")).toBeUndefined();
    expect(contextJson('{"contextJSON":"{\\"context\\":')).toBeUndefined();
  });
});

test("profileCodes: this profile's posts and reels in grid order, once each, nobody else's", () => {
  const html = [
    '<a href="/nat.geo/p/Pin_ned-1/" role="link">',
    '<a href="/Nat.Geo/reel/Reel_3/" role="link">',
    '<a href="/nat.geo/p/Pin_ned-1/" role="link">',
    '<a href="/natXgeo/p/Lookalike/">',
    '<a href="/someoneelse/p/NOTOURS123/">',
    '<a href="/nat.geo/tagged/">',
  ].join("");
  expect(profileCodes(html, "nat.geo")).toEqual(["Pin_ned-1", "Reel_3"]);
});

const node = (n: number, extra: object = {}) => ({
  is_video: false,
  dimensions: { width: 1080, height: 1350 },
  display_url: cdn(`c_${n}.jpg`),
  display_resources: [1080, 640, 480, 320].map((w) => ({
    src: cdn(`c_${n}_${w}.jpg`),
    config_width: w,
  })),
  ...extra,
});
const postPage = (media: object) =>
  embedPage(false, { context: {}, gql_data: { shortcode_media: media } });

describe("parsePost", () => {
  test("a carousel: each child, its full file, a 480 px thumb, a video's file and length", () => {
    const html = postPage({
      shortcode: "Car-ousel2",
      ...node(1),
      edge_media_to_caption: { edges: [{ node: { text: "Two\nlines" } }] },
      edge_sidecar_to_children: {
        edges: [
          { node: node(1) },
          { node: node(2, { is_video: true, video_url: cdn("c_2.mp4"), video_duration: 42.5 }) },
        ],
      },
    });
    expect(parsePost(html, "Car-ousel2")).toEqual({
      code: "Car-ousel2",
      caption: "Two\nlines",
      media: [
        {
          id: "Car-ousel2.1",
          kind: "image",
          width: 1080,
          height: 1350,
          src: cdn("c_1.jpg"),
          thumb: cdn("c_1_480.jpg"),
          duration: null,
        },
        {
          id: "Car-ousel2.2",
          kind: "video",
          width: 1080,
          height: 1350,
          src: cdn("c_2.mp4"),
          thumb: cdn("c_2_480.jpg"),
          duration: 42.5,
        },
      ],
    });
  });

  test("a video the embed won't play keeps its cover as an image; no caption is empty", () => {
    const post = parsePost(
      postPage({ shortcode: "Blocked1", ...node(1, { is_video: true }) }),
      "Blocked1",
    );
    expect([post.caption, post.media[0]?.kind, post.media[0]?.src]).toEqual([
      "",
      "image",
      cdn("c_1.jpg"),
    ]);
  });

  test("a changed shape names the field; a missing embed is not found", () => {
    expect(() =>
      parsePost(postPage({ shortcode: "X", ...node(1), dimensions: null }), "X"),
    ).toThrow(
      "Instagram's post embed has an unexpected shape at gql_data.shortcode_media.dimensions: Invalid type: Expected Object but received null",
    );
    expect(() => parsePost("<html></html>", "X")).toThrow("Instagram has no embed for X");
  });
});

test("parseProfileEmbed: the picture's size comes from its address; dates are in ms", () => {
  const html = embedPage(true, {
    context: {
      username: "nat.geo",
      full_name: "National Geo",
      is_verified: true,
      profile_pic_url: "https://a.cdninstagram.com/p.jpg?stp=dst-jpg_s150x150_tt6",
      followers_count: 5,
      posts_count: 800,
      graphql_media: [{ shortcode_media: { shortcode: "A", taken_at_timestamp: 1_795_705_200 } }],
    },
  });
  const head = parseProfileEmbed(html, "nat.geo");
  expect([head.picture.width, head.recent, head.postCount, head.verified]).toEqual([
    150,
    [{ code: "A", takenAt: 1_795_705_200_000 }],
    800,
    true,
  ]);
  expect(() => parseProfileEmbed("<html></html>", "ghost")).toThrow(
    "Instagram has no public profile called ghost",
  );
});

describe("a single photo's embed, which is HTML", () => {
  const fake = fakeInstagram(WORLD);
  const embed = (code: string) =>
    fake.fetch(`https://www.instagram.com/p/${code}/embed/captioned/`, {}).then((r) => r.text());

  test("the largest whole size, a 480 px thumb, the height from a crop, the caption unescaped", async () => {
    expect(parsePost(await embed("Photo4"), "Photo4")).toEqual({
      code: "Photo4",
      caption: "Ducks & geese\nat <dawn>",
      media: [
        {
          id: "Photo4.1",
          kind: "image",
          width: 1080,
          height: 1350,
          src: cdn("Photo4_1.jpg"),
          thumb: cdn("Photo4_1_480.jpg"),
          duration: null,
        },
      ],
    });
  });

  test("a square photo has no crops; a wide one's crop is from the sides", async () => {
    const size = async (code: string) => {
      const m = parsePost(await embed(code), code).media[0];
      return [m?.width, m?.height];
    };
    expect([await size("Photo7"), await size("Photo8")]).toEqual([
      [1080, 1080],
      [1440, 1080],
    ]);
  });
});
