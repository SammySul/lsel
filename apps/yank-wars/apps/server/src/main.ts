import { app, parseConfig } from "./server.ts";

let config: ReturnType<typeof parseConfig>;
try {
  config = parseConfig(process.env);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
}
// lsel-allow: needs serve({ prefix, csp }) in @sammysul/lsel; see server.ts
const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app(config.staticDir),
});
console.log(`yank-wars listening on ${server.url}, serving ${config.staticDir}`);
