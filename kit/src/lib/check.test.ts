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
  "biome.json": '{ "extends": "//" }',
  "tsconfig.json": '{ "extends": "@sammysul/lsel/tsconfig.json" }',
};

test("a project on the package passes", async () => {
  const root = project({
    ...CONFIGS,
    "src/web/App.svelte":
      '<!-- The only page. -->\n<script lang="ts">\nimport { Page, keys } from "@sammysul/lsel";\n</script>\n<Page name="x" version="1">hi</Page>\n<style>\n  p { color: var(--subtle); border-radius: 0; }\n</style>\n',
    "src/server/main.ts":
      '// Serves the app.\nimport { serve } from "@sammysul/lsel/server";\nserve({ name: "x" });\n',
    "src/web/lib/long.ts": `// Long, at the limit.\n${"export const x = 1;\n".repeat(399)}`,
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
    "src/web/lib/prefs.ts": '// Prefs.\nconst raw = localStorage.getItem("k");\n',
    "src/web/lib/when.ts": '// Times.\nexport const f = new Intl.DateTimeFormat("en-US");\n',
    "src/server/main.ts": "// Serves the app.\nBun.serve({ fetch: () => new Response() });\n",
    "src/web/lib/huge.ts": `// Too long.\n${"export const x = 1;\n".repeat(400)}`,
  });
  const found = (await check(root)).map((f) => `${f.file}:${f.line}: ${f.message}`).sort();
  expect(found).toEqual([
    'biome.json:1: extends "//", lsel\'s root config',
    "src/server/main.ts:2: serve() from @sammysul/lsel/server runs the server",
    "src/web/App.svelte:1: keys() from @sammysul/lsel handles keys",
    "src/web/App.svelte:1: say what the file is for in a comment on line 1",
    "src/web/App.svelte:2: Page draws the page's main",
    "src/web/App.svelte:4: colors come from tokens.css variables",
    "src/web/App.svelte:4: no shadows, gradients or blur (DESIGN.md)",
    "src/web/App.svelte:4: nothing is rounded (DESIGN.md)",
    "src/web/App.svelte:5: Cantarell and DejaVu Sans Mono only, through var(--font) or var(--font-mono)",
    "src/web/lib/huge.ts:1: 401 lines: split it, or say why under the header",
    "src/web/lib/prefs.ts:2: persisted() keeps a screen's choices",
    "src/web/lib/when.ts:2: clock() and when() format times",
    'src/web/lsel/tokens.css:1: a copy of tokens.css: import "@sammysul/lsel/tokens.css"',
    'tsconfig.json:1: extends "@sammysul/lsel/tsconfig.json" (or a file that does)',
  ]);
});

test("a line marked lsel-allow, or the line under the mark, is let through, and tests are skipped", async () => {
  const root = project({
    ...CONFIGS,
    "src/web/Editor.svelte":
      "<!-- The editor. -->\n<!-- lsel-allow: CodeMirror reads its own keys -->\n<svelte:window {onkeydown} />\n",
    "src/web/pixel.css": ".title { font-family: 'Pixel'; } /* lsel-allow: a game's title face */\n",
    "src/web/prefs.test.ts": 'localStorage.setItem("k", "v");\n',
    "e2e/app.test.ts": "Bun.serve({ fetch: () => new Response() });\n",
    "src/web/table.ts": `// A lookup table.\n// lsel-allow: one table\n${"export const x = 1;\n".repeat(400)}`,
    "src/web/long.test.ts": "export const x = 1;\n".repeat(401),
  });
  expect(await check(root)).toEqual([]);
});

test("an app mounts through start(), and browser tests that check the look check the layout too", async () => {
  const root = project({
    ...CONFIGS,
    "src/web/main.ts":
      '// Mounts the app.\nimport { mount } from "svelte";\nimport App from "./App.svelte";\nmount(App, { target: document.body });\n',
    "e2e/app.test.ts": "expect(await lselLook(page)).toEqual(LSEL_LOOK);\n",
  });
  expect(await check(root)).toEqual([
    {
      file: "src/web/main.ts",
      line: 4,
      message: "start() from @sammysul/lsel mounts the app, once its fonts are in",
    },
    {
      file: "e2e/app.test.ts",
      line: 1,
      message: "check lselLayout() beside lselLook(): the page fits the window and holds still",
    },
  ]);
  writeFileSync(
    join(root, "e2e/app.test.ts"),
    "expect(await lselLook(page)).toEqual(LSEL_LOOK);\nexpect(await lselLayout(page)).toEqual(LSEL_LAYOUT);\n",
  );
  writeFileSync(
    join(root, "src/web/main.ts"),
    '// Mounts the app.\nimport { start } from "@sammysul/lsel";\nimport App from "./App.svelte";\nawait start(App);\n',
  );
  expect(await check(root)).toEqual([]);
});
