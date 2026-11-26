import { expect, test } from "bun:test";
import * as lsel from "./index.ts";

// importing the root needs the preload to compile components; the list makes an API change deliberate
test("the package root loads in bun test and exports exactly its API", () => {
  expect(Object.keys(lsel).sort()).toEqual([
    "Action",
    "Empty",
    "Field",
    "List",
    "Page",
    "Status",
    "Swap",
    "Tabs",
    "begin",
    "clock",
    "count",
    "duration",
    "go",
    "keys",
    "palette",
    "percent",
    "persisted",
    "plural",
    "reducedMotion",
    "resource",
    "route",
    "when",
  ]);
});
