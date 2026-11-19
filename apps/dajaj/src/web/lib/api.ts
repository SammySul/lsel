import type { Report } from "../../shared/stats.ts";

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { signal });
  } catch {
    throw new Error("dajaj could not be reached");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `dajaj answered ${res.status}`);
  return body as T;
}

export const fetchPlayers = (signal: AbortSignal) =>
  get<{ players: string[] }>("/api/players", signal).then((b) => b.players);

export const fetchReport = (players: readonly string[], signal: AbortSignal) =>
  get<Report>(`/api/report?players=${players.map(encodeURIComponent).join(",")}`, signal);
