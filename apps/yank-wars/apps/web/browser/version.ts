import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");

/** Problems with the Playwright pin: nixpkgs' driver (PLAYWRIGHT_DRIVER_VERSION) builds the browsers playwright-core expects. */
export async function playwrightDrift(): Promise<string[]> {
  const nix = process.env.PLAYWRIGHT_DRIVER_VERSION;
  if (nix === undefined) return ["PLAYWRIGHT_DRIVER_VERSION is unset: run inside the dev shell"];
  const root = (await Bun.file(join(ROOT, "package.json")).json()) as {
    devDependencies?: Record<string, string>;
  };
  const installed = (await Bun.file(
    join(ROOT, "node_modules/playwright-core/package.json"),
  ).json()) as {
    version: string;
  };
  const out: string[] = [];
  const pinned = root.devDependencies?.["playwright-core"];
  if (pinned !== nix)
    out.push(`package.json pins playwright-core ${pinned}, nixpkgs has playwright-driver ${nix}`);
  if (installed.version !== nix)
    out.push(`node_modules has playwright-core ${installed.version}, nixpkgs ${nix}`);
  return out;
}
