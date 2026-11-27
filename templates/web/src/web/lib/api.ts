// Calls the server's API; getJson turns a failure into a message for the screen.

import { getJson } from "@sammysul/lsel";
import type { Hello } from "../../shared/types.ts";

export const fetchHello = (signal: AbortSignal) =>
  getJson<Hello>("/api/hello", signal, "the server");
