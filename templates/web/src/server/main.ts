// Starts the server: the built page and the API.

import { serve } from "@sammysul/lsel/server";
import { name } from "../../package.json";
import { api } from "./api.ts";
import { PORT } from "./config.ts";

serve({ name, port: PORT, routes: () => api() });
