// lselFonts(): preloads the kit's fonts from the page's head, so they arrive before start() mounts the app.

import type { Plugin } from "vite";

/** Every app's vite.config: without it a font starts loading only once the CSS is in, too late for a first visit. */
export function lselFonts(): Plugin {
  return {
    name: "lsel-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (_html, ctx) =>
        Object.keys(ctx.bundle ?? {})
          .filter((file) => file.endsWith(".woff2"))
          .map((file) => ({
            tag: "link",
            // a font is fetched in CORS mode, so its preload must be too, or the browser fetches it twice
            attrs: {
              rel: "preload",
              href: `/${file}`,
              as: "font",
              type: "font/woff2",
              crossorigin: "",
            },
            injectTo: "head-prepend" as const,
          })),
    },
  };
}
