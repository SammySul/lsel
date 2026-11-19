import { serve } from "@sammysul/lsel/server";
import { CSP } from "./server.ts";

serve({ name: "yank-wars", prefix: "YW", port: 7300, csp: CSP });
