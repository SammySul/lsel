// What the browser remembers: the last few profiles that loaded, newest first.

import { persisted } from "@sammysul/lsel";
import * as v from "valibot";
import { USERNAME } from "../../shared/types.ts";

const RECENT = 5;

export const recent = persisted("grab:recent", v.array(v.pipe(v.string(), v.regex(USERNAME))), []);

export function remember(name: string): void {
  recent.value = [name, ...recent.value.filter((n) => n !== name)].slice(0, RECENT);
}
