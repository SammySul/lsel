import { parseConfig } from "./config.ts";
import { startServer } from "./server.ts";

let config: ReturnType<typeof parseConfig>;
try {
  config = parseConfig(process.env);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
}
const server = startServer(config);
console.log(`yank-wars listening on ${server.url}, serving ${config.staticDir}`);
