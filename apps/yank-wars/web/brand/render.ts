// bun run brand: renders og.html and the favicon to the PNGs in public/ (needs the dev shell's browsers).
import { join } from "node:path";
import { chromium } from "playwright-core";

const PUBLIC = join(import.meta.dir, "../public");
const browser = await chromium.launch({ headless: true });
try {
  // The brand images are the dark palette, like the favicon.
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    colorScheme: "dark",
  });
  await page.goto(`file://${join(import.meta.dir, "og.html")}`, { waitUntil: "load" });
  await page.screenshot({ path: join(PUBLIC, "og.png") });
  await page.setViewportSize({ width: 180, height: 180 });
  await page.goto(`file://${join(PUBLIC, "favicon.svg")}`, { waitUntil: "load" });
  await page.screenshot({ path: join(PUBLIC, "apple-touch-icon.png") });
} finally {
  await browser.close();
}
