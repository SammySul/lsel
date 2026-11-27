// Serves the built app.

import { serve } from "@sammysul/lsel/server";
import { name } from "../../package.json";
import { PORT } from "./config.ts";

serve({ name, port: PORT });
