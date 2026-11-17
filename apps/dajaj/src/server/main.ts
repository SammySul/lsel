import { Database } from "bun:sqlite";
import { parseConfig } from "./config.ts";
import { Pubg } from "./pubg.ts";
import { handler } from "./server.ts";

let config: ReturnType<typeof parseConfig>;
try {
  config = parseConfig(process.env);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
}
const pubg = new Pubg({
  apiKey: config.apiKey,
  baseUrl: config.apiUrl,
  db: new Database(config.db, { create: true }),
});
const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: handler({ staticDir: config.staticDir, players: config.players, pubg }),
});
console.log(`dajaj listening on ${server.url} for ${config.players.join(", ")}`);
