const read = () =>
  typeof location !== "undefined" && location.hash.startsWith("#/") ? location.hash.slice(1) : "/";

/** The `#/…` screen, so reload and the back button keep it. */
export const route = $state({ path: read() });

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    route.path = read();
  });
}

export function go(path: string): void {
  route.path = path;
  location.hash = path;
}
