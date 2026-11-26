// Serves the built app.

import { serve } from "@sammysul/lsel/server";
import { name } from "../../package.json";

serve({ name, port: 7200 });
