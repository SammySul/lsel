// Reads an app's own API, turning each way it can fail into a sentence for the screen.

/** GETs `path` as JSON; fails with the server's `{ error }`, or names `who` when it can't be reached or says nothing. An abort is rethrown as is. */
export async function getJson<T>(path: string, signal: AbortSignal, who: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { signal });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(`${who} could not be reached`);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `${who} answered ${res.status}`);
  }
  return body as T;
}
