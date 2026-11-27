// Starts the server: the built web app and the API.

import { serve } from "@sammysul/lsel/server";
import { name } from "../../package.json";
import { api } from "./api.ts";
import { PORT } from "./config.ts";
import { Instagram } from "./instagram.ts";

serve({
  name,
  port: PORT,
  // a first look at a profile paces a dozen requests to Instagram, retrying refused ones
  idleTimeout: 255,
  routes: () => api({ instagram: new Instagram() }),
});
