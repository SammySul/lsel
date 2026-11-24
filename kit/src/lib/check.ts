#!/usr/bin/env bun
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
    message: "Inter or JetBrains Mono only, through var(--font) or var(--font-mono)",
  },
  {
    in: MARKUP,
    pattern: /<main[\s>]/,
    message: "Page draws the page's main",
  },
];

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
  for await (const path of files(root)) {
    const file = relative(root, path);
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
    lines.forEach((text, i) => {
      if (text.includes("lsel-allow") || lines[i - 1]?.includes("lsel-allow")) return;
      for (const r of rules) {
        if (r.pattern.test(text)) out.push({ file, line: i + 1, message: r.message });
      }
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
