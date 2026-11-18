import { name } from "../../package.json";
import { parseConfig } from "./config.ts";
import { openSaves } from "./saves.ts";
import { handler } from "./server.ts";

let config: ReturnType<typeof parseConfig>;
try {
  config = parseConfig(process.env);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
}
const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: handler({ staticDir: config.staticDir, saves: openSaves(config.db) }),
});
console.log(`${name} listening on ${server.url}`);
