import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { check } from "./check.ts";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "lsel-check-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const CONFIGS = {
  "biome.json": '{ "extends": ["@sammysul/lsel/biome"] }',
  "tsconfig.json": '{ "extends": "@sammysul/lsel/tsconfig.json" }',
};

test("a project on the package passes", async () => {
  const root = project({
    ...CONFIGS,
    "src/web/App.svelte":
      '<script lang="ts">\nimport { Page, keys } from "@sammysul/lsel";\n</script>\n<Page name="x" version="1">hi</Page>\n<style>\n  p { color: var(--subtle); border-radius: 0; }\n</style>\n',
    "src/server/main.ts": 'import { serve } from "@sammysul/lsel/server";\nserve({ name: "x" });\n',
  });
  expect(await check(root)).toEqual([]);
});

test("names each hand-rolled piece and design break, by file and line", async () => {
  const root = project({
    "biome.json": '{ "linter": { "rules": { "preset": "recommended" } } }',
    "tsconfig.json": '{ "compilerOptions": {} }',
    "src/web/lsel/tokens.css": ":root {}",
    "src/web/App.svelte": [
      "<svelte:window {onkeydown} />",
      "<main>",
      "<style>",
      "  .card { border-radius: 4px; box-shadow: 0 1px 2px var(--base); color: #fff; }",
      '  h1 { font-family: "Inter"; }',
      "</style>",
    ].join("\n"),
    "src/web/lib/prefs.ts": 'const raw = localStorage.getItem("k");\n',
    "src/web/lib/when.ts": 'export const f = new Intl.DateTimeFormat("en-US");\n',
    "src/server/main.ts": "Bun.serve({ fetch: () => new Response() });\n",
  });
  const found = (await check(root)).map((f) => `${f.file}:${f.line}: ${f.message}`).sort();
  expect(found).toEqual([
    'biome.json:1: extends ["@sammysul/lsel/biome"]',
    "src/server/main.ts:1: serve() from @sammysul/lsel/server runs the server",
    "src/web/App.svelte:1: keys() from @sammysul/lsel handles keys",
    "src/web/App.svelte:2: Page draws a page's main; Popup an extension's",
    "src/web/App.svelte:4: colors come from tokens.css variables",
    "src/web/App.svelte:4: no shadows, gradients or blur (DESIGN.md)",
    "src/web/App.svelte:4: nothing is rounded (DESIGN.md)",
    "src/web/App.svelte:5: JetBrains Mono only, through var(--font)",
    "src/web/lib/prefs.ts:1: persisted() keeps a screen's choices",
    "src/web/lib/when.ts:1: clock() and when() format times",
    'src/web/lsel/tokens.css:1: a copy of tokens.css: import "@sammysul/lsel/tokens.css"',
    'tsconfig.json:1: extends "@sammysul/lsel/tsconfig.json" (or a file that does)',
  ]);
});

test("a line marked lsel-allow, or the line under the mark, is let through, and tests are skipped", async () => {
  const root = project({
    ...CONFIGS,
    "src/web/Editor.svelte":
      "<!-- lsel-allow: CodeMirror reads its own keys -->\n<svelte:window {onkeydown} />\n",
    "src/web/pixel.css": ".title { font-family: 'Pixel'; } /* lsel-allow: a game's title face */\n",
    "src/web/prefs.test.ts": 'localStorage.setItem("k", "v");\n',
    "e2e/app.test.ts": "Bun.serve({ fetch: () => new Response() });\n",
  });
  expect(await check(root)).toEqual([]);
});
