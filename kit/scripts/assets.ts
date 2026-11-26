// Copies the Nix-built fonts and palette into src/lib/assets, which the kit exports from source.

import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const built = Bun.spawnSync(["nix", "build", "--no-link", "--print-out-paths", "..#assets"], {
  cwd: root,
});
if (built.exitCode !== 0) throw new Error(`nix build ..#assets failed:\n${built.stderr}`);
const to = join(root, "src/lib/assets");
await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(built.stdout.toString().trim(), to, { recursive: true });
// the store copy is read-only; the next run must be able to replace it
Bun.spawnSync(["chmod", "-R", "u+w", to]);
