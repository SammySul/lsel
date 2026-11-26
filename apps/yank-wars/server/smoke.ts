// Plays one room round against a built server: bun server/smoke.ts <the yank-wars package's out path>
// Proves what only the compiled binary can: the embedded replay worker and puzzles.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL, parseKeys, type ServerFrame } from "@yank-wars/engine";

const out = process.argv[2];
if (out === undefined) throw new Error("usage: bun server/smoke.ts <out path>");
const port = 20_000 + Math.floor(Math.random() * 20_000);
const proc = Bun.spawn([join(out, "bin/yank-wars")], {
  env: { ...process.env, YW_PORT: String(port) },
  cwd: process.env.TMPDIR ?? "/tmp",
  stdout: "pipe",
  stderr: "inherit",
});

async function listening(): Promise<void> {
  const reader = proc.stdout.getReader();
  let text = "";
  while (!text.includes("listening on")) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`server exited: ${text}`);
    text += new TextDecoder().decode(value);
  }
  reader.releaseLock();
}

type Next = (t: string, ok?: (f: ServerFrame) => boolean) => Promise<ServerFrame>;

function client(): Promise<{ ws: WebSocket; next: Next }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const frames: ServerFrame[] = [];
  let wake = () => {};
  ws.onmessage = (e) => {
    frames.push(JSON.parse(String(e.data)) as ServerFrame);
    wake();
  };
  const next: Next = async (t, ok = () => true) => {
    for (;;) {
      const i = frames.findIndex((f) => f.t === t && ok(f));
      if (i >= 0) return frames.splice(0, i + 1).at(-1) as ServerFrame;
      await new Promise<void>((r) => {
        wake = r;
      });
    }
  };
  return new Promise((resolve) => {
    ws.onopen = () => resolve({ ws, next });
  });
}

const send = (ws: WebSocket, f: Record<string, unknown>) =>
  ws.send(JSON.stringify({ v: PROTOCOL, ...f }));

// a frame the server refuses gets no answer: fail instead of waiting for CI's own timeout
const giveUp = setTimeout(() => {
  console.error("smoke: no verdict within 60 s");
  proc.kill();
  process.exit(1);
}, 60_000);

try {
  await Promise.race([
    listening(),
    Bun.sleep(10_000).then(() => Promise.reject(new Error("no listening line"))),
  ]);
  const a = await client();
  send(a.ws, { t: "hello", name: "smoke" });
  const welcome = (await a.next("welcome")) as Extract<ServerFrame, { t: "welcome" }>;
  const b = await client();
  send(b.ws, { t: "hello", room: welcome.state.room, name: "smoke" });
  await b.next("welcome");
  send(a.ws, { t: "lobby", ready: true });
  send(b.ws, { t: "lobby", ready: true });
  const study = (await a.next("state")) as Extract<ServerFrame, { t: "state" }>;
  const id = study.state.puzzleId as string;
  const json = JSON.parse(
    readFileSync(join(import.meta.dir, `../puzzles/handmade/${id}.json`), "utf8"),
  ) as { solution: string };
  const keys = parseKeys(json.solution);
  send(a.ws, { t: "ready" });
  send(b.ws, { t: "ready" });
  await b.next("state", (f) => f.t === "state" && f.state.phase === "playing");
  send(a.ws, { t: "keys", round: 1, from: 0, entries: keys });
  send(a.ws, { t: "claim", round: 1, length: keys.length, doc: "" });
  const verdict = await a.next("verdict");
  const want = { t: "verdict", round: 1, ok: true, score: keys.length };
  if (JSON.stringify(verdict) !== JSON.stringify(want)) {
    throw new Error(`verdict ${JSON.stringify(verdict)}, expected ${JSON.stringify(want)}`);
  }
  console.log(`smoke: ${id} verified in the built server (${keys.length} keys)`);
} finally {
  clearTimeout(giveUp);
  proc.kill();
}
