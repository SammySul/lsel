import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, type Entry, zip } from "./zip.ts";

async function* from(entries: Entry[]): AsyncGenerator<Entry> {
  yield* entries;
}

async function written(entries: Entry[]): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), "grab-zip-")), "out.zip");
  writeFileSync(path, new Uint8Array(await new Response(zip(from(entries))).arrayBuffer()));
  return path;
}

const unzip = (...args: string[]) => {
  const r = Bun.spawnSync(["unzip", ...args]);
  return { code: r.exitCode, out: r.stdout.toString() };
};

test("crc32 gives the standard check value", () => {
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
});

test("unzip reads back every entry, its bytes, name and time", async () => {
  const video = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
  const path = await written([
    {
      name: "nat.geo_Car-ousel2_1.jpg",
      data: new TextEncoder().encode("a photo"),
      modified: new Date("2026-11-20T15:04:06Z"),
    },
    { name: "nat.geo_Reel_3_1.mp4", data: video, modified: new Date("2026-11-19T09:30:00Z") },
    { name: "empty.txt", data: new Uint8Array(), modified: new Date("2026-01-02T03:04:05Z") },
  ]);
  expect(unzip("-tq", path)).toEqual({
    code: 0,
    out: `No errors detected in compressed data of ${path}.\n`,
  });
  const listing = unzip("-Z", "-T", path).out.split("\n");
  expect(
    listing.filter((l) => l.startsWith("-")).map((l) => l.split(/\s+/).slice(3).join(" ")),
  ).toEqual([
    "7 b- stor 20261120.150406 nat.geo_Car-ousel2_1.jpg",
    "70000 b- stor 20261119.093000 nat.geo_Reel_3_1.mp4",
    "0 b- stor 20260102.030404 empty.txt",
  ]);
  expect(unzip("-p", path, "nat.geo_Car-ousel2_1.jpg").out).toBe("a photo");
  const back = Bun.spawnSync(["unzip", "-p", path, "nat.geo_Reel_3_1.mp4"]).stdout;
  expect(Buffer.compare(back, Buffer.from(video))).toBe(0);
});

test("no entries is the 22-byte empty archive", async () => {
  const bytes = new Uint8Array(await new Response(zip(from([]))).arrayBuffer());
  expect([...bytes]).toEqual([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
});
