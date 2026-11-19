import { plugin } from "bun";
import { compileModule } from "svelte/compiler";

let registered = false;

/** Compiles `*.svelte.ts` (runes) for `bun test` as Vite would, for modules imported after this call. */
export function registerSvelteModules(): void {
  if (registered) return;
  registered = true;
  const ts = new Bun.Transpiler({ loader: "ts", define: { "import.meta.env.DEV": "true" } });
  plugin({
    name: "svelte-modules",
    setup(build) {
      build.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
        const js = ts.transformSync(await Bun.file(path).text());
        const out = compileModule(js, { filename: path, generate: "client", dev: true });
        return { contents: out.js.code, loader: "js" };
      });
    },
  });
}
