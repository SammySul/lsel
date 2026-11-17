// bun run sync [--check]: writes lsel's assets into every projects/<name>/ that has an lsel.json.
// lsel.json: { "assets": "<dir inside the project>" }; that directory belongs to lsel, so extra files are removed.
// It also fails on app CSS that restyles an element tokens.css styles (DESIGN.md, Elements): layout and color are fine.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const check = process.argv.includes("--check");

const built = Bun.spawnSync(["nix", "build", "--no-link", "--print-out-paths", ".#assets"], { cwd: root });
if (built.exitCode !== 0) throw new Error(`nix build .#assets failed:\n${built.stderr}`);
const assets = built.stdout.toString().trim();
const files = (await readdir(assets)).sort();

// Elements tokens.css styles, and the properties that make their look.
const ELEMENTS = new Set(["a", "button", "select", "input", "textarea", "kbd", "h1", "h2", "pre", "code", "table", "th", "td"]);
const LOOK = /^(background|border|padding|font|letter-spacing|line-height|outline|cursor|text-decoration)/;

async function restyles(project: string, assetsDir: string): Promise<string[]> {
  const found: string[] = [];
  for await (const file of new Bun.Glob("**/*.{css,svelte}").scan(project)) {
    if (/(^|\/)(node_modules|dist|build|\.svelte-kit)\//.test(file) || file.startsWith(`${assetsDir}/`)) continue;
    let css = await readFile(join(project, file), "utf8");
    if (file.endsWith(".svelte")) css = css.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
    css = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selectors = "", body = ""] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const hit = selectors.split(",").some((sel) => {
        const last = sel.trim().split(/[\s>+~]+/).at(-1) ?? "";
        return ELEMENTS.has(last.match(/^[a-z][a-z0-9]*/)?.[0] ?? "");
      });
      if (!hit) continue;
      const props = body
        .split(";")
        .map((d) => d.split(":")[0]?.trim() ?? "")
        .filter((p) => LOOK.test(p));
      if (props.length > 0) found.push(`${file}: ${selectors.trim().replace(/\s+/g, " ")} { ${props.join(", ")} }`);
    }
  }
  return found;
}

let drift = 0;
for (const name of (await readdir(join(root, "projects"), { withFileTypes: true }).catch(() => []))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()) {
  const project = join(root, "projects", name);
  const config = await readFile(join(project, "lsel.json"), "utf8").catch(() => undefined);
  if (config === undefined) continue;
  const assetsDir = (JSON.parse(config) as { assets: string }).assets;
  const target = join(project, assetsDir);
  const local = await restyles(project, assetsDir);
  if (local.length > 0) {
    drift++;
    console.log(`${name}: restyles shared elements\n${local.map((l) => `  ${l}`).join("\n")}`);
  }
  const present = await readdir(target).catch(() => [] as string[]);
  const changed: string[] = [];
  for (const f of files) {
    const want = await readFile(join(assets, f));
    const have = await readFile(join(target, f)).catch(() => undefined);
    if (have === undefined || !want.equals(have)) changed.push(f);
  }
  const extra = present.filter((f) => !files.includes(f));
  if (changed.length + extra.length === 0) {
    console.log(`${name}: up to date`);
    continue;
  }
  if (check) {
    drift++;
    console.log(`${name}: out of date (${[...changed, ...extra.map((f) => `-${f}`)].join(", ")})`);
    continue;
  }
  await mkdir(target, { recursive: true });
  for (const f of changed) await writeFile(join(target, f), await readFile(join(assets, f)));
  for (const f of extra) await rm(join(target, f));
  console.log(`${name}: wrote ${[...changed, ...extra.map((f) => `-${f}`)].join(", ")}`);
}
if (drift > 0) process.exit(1);
