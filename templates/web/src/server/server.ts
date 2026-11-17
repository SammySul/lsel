import { resolve, sep } from "node:path";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function respond(body: BodyInit | null, status: number, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

const text = (body: string, status: number) =>
  respond(body, status, { "Content-Type": "text/plain; charset=utf-8" });

/** The file under `root` that `pathname` names, or null when it would leave `root`. */
export function resolveStatic(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const base = resolve(root);
  const file = resolve(base, `.${decoded}`);
  return file.startsWith(base + sep) ? file : null;
}

export function handler(staticDir: string): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return respond("method not allowed", 405, { Allow: "GET, HEAD" });
    }
    const { pathname } = new URL(req.url);
    if (pathname === "/healthz") return text("ok", 200);
    const path = resolveStatic(staticDir, pathname === "/" ? "/index.html" : pathname);
    if (path === null) return text("not found", 404);
    const file = Bun.file(path);
    if (!(await file.exists())) return text("not found", 404);
    const cache = pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";
    return respond(req.method === "HEAD" ? null : file, 200, {
      "Content-Type": file.type,
      "Cache-Control": cache,
    });
  };
}
