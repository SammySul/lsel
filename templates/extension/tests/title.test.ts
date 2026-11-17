import { expect, test } from "bun:test";
import { title } from "../src/popup/title";

test("the popup's heading is the manifest's name and version", () => {
  expect(title({ name: "project", version: "0.1.0" })).toBe("project v0.1.0");
});
