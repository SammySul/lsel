// Starts the server: the built web app and the API.

import { serve } from "@sammysul/lsel/server";
import { name } from "../../package.json";
import { api } from "./api.ts";
import { PORT } from "./config.ts";
import { Instagram } from "./instagram.ts";
import { Threads } from "./threads.ts";

serve({
  name,
  port: PORT,
  // a first answer waits for the embed and profile page, each retried after 5 s, and a zip may wait for every post
  idleTimeout: 255,
  routes: () => api({ instagram: new Instagram({ threads: new Threads() }) }),
});
