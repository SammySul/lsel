// Starts the server: the built web app and the API.

import { Database } from "bun:sqlite";
import { serve } from "@sammysul/lsel/server";
import { name } from "../../package.json";
import { api } from "./api.ts";
import { ENV, PORT } from "./config.ts";
import { Pubg } from "./pubg.ts";

serve({
  name,
  port: PORT,
  extra: ENV,
  routes: (config) =>
    api({
      players: config.DAJAJ_PLAYERS,
      pubg: new Pubg({
        apiKey: config.PUBG_API_KEY,
        baseUrl: config.PUBG_API_URL,
        db: new Database(config.DAJAJ_DB, { create: true }),
      }),
    }),
});
