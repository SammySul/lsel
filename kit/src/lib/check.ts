#!/usr/bin/env bun
// lsel-check: what every app must use from the kit and follow from DESIGN.md, file length and file headers.
// A line marked `lsel-allow: <why>`, or the line under the mark, is exempt.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export interface Finding {
  file: string;
  line: number;
  message: string;
}

interface Rule {
  in: readonly string[];
  pattern: RegExp;
  message: string;
}

const MARKUP = [".svelte"];
const STYLE = [".svelte", ".css"];
const CODE = [".svelte", ".ts"];

const RULES: readonly Rule[] = [
  {
    in: CODE,
    pattern: /<svelte:window[^>]*onkeydown|addEventListener\(\s*["']keydown/,
    message: "keys() from @sammysul/lsel handles keys",
  },
  { in: CODE, pattern: /\blocalStorage\b/, message: "persisted() keeps a screen's choices" },
  {
    in: CODE,
    pattern: /Intl\.DateTimeFormat|toLocale(Date|Time)?String\(/,
    message: "clock() and when() format times",
  },
  {
    in: CODE,
    pattern: /matchMedia\(\s*["'`]\(?prefers-reduced-motion/,
    message: "reducedMotion() reads the motion setting",
  },
  {
    in: [".ts"],
    pattern: /\bBun\.serve\(/,
    message: "serve() from @sammysul/lsel/server runs the server",
  },
  { in: STYLE, pattern: /#[0-9a-fA-F]{3,8}\b/, message: "colors come from tokens.css variables" },
  {
    in: STYLE,
    pattern: /border-radius\s*:(?!\s*0(?:px)?(?:[;\s}]|$))/,
    message: "nothing is rounded (DESIGN.md)",
  },
  {
    in: STYLE,
    pattern: /box-shadow\s*:(?!\s*none)|gradient\(|backdrop-filter|filter\s*:\s*blur/,
    message: "no shadows, gradients or blur (DESIGN.md)",
  },
  {
    in: STYLE,
    pattern: /font-family\s*:(?!\s*var\(--font(?:-mono)?\)|\s*inherit)/,
    message: "Cantarell and DejaVu Sans Mono only, through var(--font) or var(--font-mono)",
  },
  {
    in: MARKUP,
    pattern: /<main[\s>]/,
    message: "Page draws the page's main",
  },
  {
    in: [".ts"],
    pattern: /\bmount\(\s*App\b/,
    message: "start() from @sammysul/lsel mounts the app, once its fonts are in",
  },
];

// A longer file usually does several jobs; one that shouldn't be split says why under its header.
const MAX_LINES = 400;

/** Line 1 says what the file is for (line 2 after a #!), in a comment that isn't an lsel-allow mark. */
function hasHeader(lines: readonly string[]): boolean {
  const first = lines[0]?.startsWith("#!") ? lines[1] : lines[0];
  return first !== undefined && /^(\/\/|<!--)/.test(first) && !first.includes("lsel-allow");
}

const SKIP = new Set(["node_modules", "dist", ".git", ".direnv", "result", "playground-dist"]);

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const isTest = (path: string) => /\.(test|spec|fixture)\.|[/\\](e2e|test|tests)[/\\]/.test(path);

async function configFindings(root: string): Promise<Finding[]> {
  const out: Finding[] = [];
  // without one, lsel's root biome.json applies
  const biome = await readFile(join(root, "biome.json"), "utf8").catch(() => undefined);
  if (biome !== undefined && !/"extends"\s*:\s*"\/\/"/.test(biome)) {
    out.push({ file: "biome.json", line: 1, message: 'extends "//", lsel\'s root config' });
  }
  const tsconfig = await readFile(join(root, "tsconfig.json"), "utf8").catch(() => "");
  if (!/"extends"\s*:\s*"(@sammysul\/lsel\/tsconfig\.json|\.{1,2}\/[^"]+)"/.test(tsconfig)) {
    out.push({
      file: "tsconfig.json",
      line: 1,
      message: 'extends "@sammysul/lsel/tsconfig.json" (or a file that does)',
    });
  }
  return out;
}

export async function check(root: string): Promise<Finding[]> {
  const out = await configFindings(root);
  // browser tests that check the look check the layout too (DESIGN.md, Layout)
  let looks: string | undefined;
  let layout = false;
  for await (const path of files(root)) {
    const file = relative(root, path);
    if (isTest(file) && /\.(ts|js)$/.test(file)) {
      const text = await readFile(path, "utf8");
      if (looks === undefined && text.includes("lselLook(")) looks = file;
      if (text.includes("lselLayout(")) layout = true;
    }
    if (file.endsWith("tokens.css")) {
      out.push({
        file,
        line: 1,
        message: 'a copy of tokens.css: import "@sammysul/lsel/tokens.css"',
      });
      continue;
    }
    if (isTest(file)) continue;
    const ext = file.slice(file.lastIndexOf("."));
    const rules = RULES.filter((r) => r.in.includes(ext));
    if (rules.length === 0) continue;
    const lines = (await readFile(path, "utf8")).split("\n");
    const length = lines.at(-1) === "" ? lines.length - 1 : lines.length;
    if (file.endsWith("vite.config.ts") && !lines.some((l) => l.includes("lselFonts("))) {
      out.push({
        file,
        line: 1,
        message: "lselFonts() preloads the fonts, or a first visit shows the fallback faces",
      });
    }
    if (CODE.includes(ext) && !hasHeader(lines)) {
      out.push({ file, line: 1, message: "say what the file is for in a comment on line 1" });
    }
    const marked = lines.slice(0, 3).some((l) => l.includes("lsel-allow"));
    if (CODE.includes(ext) && length > MAX_LINES && !marked) {
      out.push({
        file,
        line: 1,
        message: `${length} lines: split it, or say why under the header`,
      });
    }
    lines.forEach((text, i) => {
      if (text.includes("lsel-allow") || lines[i - 1]?.includes("lsel-allow")) return;
      for (const r of rules) {
        if (r.pattern.test(text)) out.push({ file, line: i + 1, message: r.message });
      }
    });
  }
  if (looks !== undefined && !layout) {
    out.push({
      file: looks,
      line: 1,
      message: "check lselLayout() beside lselLook(): the page fits the window and holds still",
    });
  }
  return out;
}

if (import.meta.main) {
  const found = await check(process.cwd());
  for (const f of found) console.error(`${f.file}:${f.line}: ${f.message}`);
  if (found.length > 0) {
    console.error(`lsel-check: ${found.length} to fix, or mark the line \`lsel-allow: <why>\``);
    process.exit(1);
  }
}
