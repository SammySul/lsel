// Starts the server: the built game and the save sync service.

import { serve } from "@sammysul/lsel/server";
import { name } from "../../package.json";
import { openSaves } from "./saves.ts";
import { ENV, syncRoutes } from "./sync.ts";

serve({ name, extra: ENV, routes: (config) => syncRoutes(openSaves(config.LSEL_STATION_DB)) });
