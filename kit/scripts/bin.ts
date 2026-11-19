// svelte-package copies everything and drops the executable bit.
import { chmod, rm } from "node:fs/promises";
import { join } from "node:path";

const dist = join(import.meta.dir, "../dist");
await chmod(join(dist, "check.js"), 0o755);
for await (const f of new Bun.Glob("**/*.{test,fixture}.*").scan(dist)) await rm(join(dist, f));
