// Compiles Svelte components and rune modules for bun test as Vite would.

import { plugin } from "bun";
import { compile, compileModule } from "svelte/compiler";

let registered = false;

/** Compiles components and rune modules for `bun test` as Vite would; run with `--conditions=browser`. */
export function registerSvelteModules(): void {
  if (registered) return;
  registered = true;
  const ts = new Bun.Transpiler({ loader: "ts", define: { "import.meta.env.DEV": "true" } });
  const options = { generate: "client", dev: true } as const;
  plugin({
    name: "svelte",
    setup(build) {
      build.onLoad({ filter: /\.svelte\.(ts|js)$/ }, async ({ path }) => {
        const source = await Bun.file(path).text();
        const js = path.endsWith(".ts") ? ts.transformSync(source) : source;
        return {
          contents: compileModule(js, { filename: path, ...options }).js.code,
          loader: "js",
        };
      });
      build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
        const out = compile(await Bun.file(path).text(), {
          filename: path,
          ...options,
          css: "injected",
        });
        return { contents: out.js.code, loader: "js" };
      });
    },
  });
}
