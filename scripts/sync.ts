// bun run sync [--check] [<project>…]: keeps the files a project takes from its template identical to it
// (lsel.json: { "template"?: "web" | "extension", "files": [...] }; a template's own lsel.json is the
// starter a new project copies), and the extension template's shared files identical to the web template's.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const EXTENSION_FROM_WEB = [
  ".envrc",
  "LICENSE",
  "CLAUDE.md",
  "biome.json",
  ".npmrc",
  "bunfig.toml",
  "nix/bun2nix-lockfile-v2.patch",
  "nix/bun-cache-alias.sh",
];

const root = join(import.meta.dir, "..");
const check = process.argv.includes("--check");
const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const all = (await readdir(join(root, "projects"), { withFileTypes: true }).catch(() => []))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const unknown = named.filter((n) => !all.includes(n));
if (unknown.length > 0) throw new Error(`no such project: ${unknown.join(", ")}`);

interface Target {
  name: string;
  template: string;
  files: string[];
}

const targets: Target[] = [
  { name: "templates/extension", template: "web", files: EXTENSION_FROM_WEB },
];
for (const name of all.filter((n) => named.length === 0 || named.includes(n)).sort()) {
  const raw = await readFile(join(root, "projects", name, "lsel.json"), "utf8").catch(() => undefined);
  if (raw === undefined) continue;
  const config = JSON.parse(raw) as { template?: string; files?: string[] };
  targets.push({
    name: `projects/${name}`,
    template: config.template ?? "web",
    files: config.files ?? [],
  });
}

let drift = 0;
for (const { name, template, files } of targets) {
  const changed: string[] = [];
  for (const file of files) {
    const want = await readFile(join(root, "templates", template, file));
    const have = await readFile(join(root, name, file)).catch(() => undefined);
    if (have === undefined || !want.equals(have)) changed.push(file);
  }
  if (changed.length === 0) {
    console.log(`${name}: up to date`);
    continue;
  }
  if (check) {
    drift++;
    console.log(`${name}: out of date (${changed.join(", ")})`);
    continue;
  }
  for (const file of changed) {
    await mkdir(dirname(join(root, name, file)), { recursive: true });
    await writeFile(join(root, name, file), await readFile(join(root, "templates", template, file)));
  }
  console.log(`${name}: wrote ${changed.join(", ")}`);
}
if (drift > 0) process.exit(1);
