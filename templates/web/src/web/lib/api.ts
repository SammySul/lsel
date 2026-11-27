// Calls the server's API, turning a failure into a message for the screen.

import type { Hello } from "../../shared/types.ts";

export async function fetchHello(signal: AbortSignal): Promise<Hello> {
  let res: Response;
  try {
    res = await fetch("/api/hello", { signal });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error("the server could not be reached");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `the server answered ${res.status}`);
  return body as Hello;
}
