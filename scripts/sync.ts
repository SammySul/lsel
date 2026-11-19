// bun run sync [--check] [<project>…]: writes lsel's shared files into the templates and the named projects/<name>/
// (every one with an lsel.json when none is named).
// lsel.json: { "assets"?: "<dir>", "template": "web" | "extension", "files": ["<path>", …] }. The assets directory
// belongs to lsel, so extra files there are removed (a project on @sammysul/lsel has none); each path in "files" is
// kept identical to that template's file at the same path ("web" when no template is named).
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");
const check = process.argv.includes("--check");
const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const built = Bun.spawnSync(["nix", "build", "--no-link", "--print-out-paths", ".#assets"], { cwd: root });
if (built.exitCode !== 0) throw new Error(`nix build .#assets failed:\n${built.stderr}`);
const assets = built.stdout.toString().trim();
const assetFiles = (await readdir(assets)).sort();

const projects = (await readdir(join(root, "projects"), { withFileTypes: true }).catch(() => []))
  .filter((d) => d.isDirectory() && (named.length === 0 || named.includes(d.name)))
  .map((d) => join("projects", d.name))
  .sort();

let drift = 0;
// the templates carry the assets too, so they build as shipped and CI catches a palette change they missed
for (const name of ["templates/web", "templates/extension", ...projects]) {
  const project = join(root, name);
  const raw = await readFile(join(project, "lsel.json"), "utf8").catch(() => undefined);
  if (raw === undefined) continue;
  const config = JSON.parse(raw) as { assets?: string; template?: string; files?: string[] };
  const template = join(root, "templates", config.template ?? "web");
  const dir = config.assets;
  const wanted = [
    ...(dir === undefined ? [] : assetFiles.map((f) => ({ from: join(assets, f), to: join(dir, f) }))),
    ...(config.files ?? []).map((f) => ({ from: join(template, f), to: f })),
  ];
  const changed: typeof wanted = [];
  for (const w of wanted) {
    const want = await readFile(w.from);
    const have = await readFile(join(project, w.to)).catch(() => undefined);
    if (have === undefined || !want.equals(have)) changed.push(w);
  }
  const extra = (dir === undefined ? [] : await readdir(join(project, dir)).catch(() => []))
    .filter((f) => !assetFiles.includes(f))
    .map((f) => join(dir ?? "", f));
  const list = [...changed.map((w) => w.to), ...extra.map((f) => `-${f}`)].join(", ");
  if (list === "") {
    console.log(`${name}: up to date`);
    continue;
  }
  if (check) {
    drift++;
    console.log(`${name}: out of date (${list})`);
    continue;
  }
  for (const w of changed) {
    await mkdir(dirname(join(project, w.to)), { recursive: true });
    await writeFile(join(project, w.to), await readFile(w.from));
  }
  for (const f of extra) await rm(join(project, f));
  console.log(`${name}: wrote ${list}`);
}
if (drift > 0) process.exit(1);
