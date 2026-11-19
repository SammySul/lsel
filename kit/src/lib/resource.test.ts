import { expect, test } from "bun:test";
import { owned, resource } from "./resource.fixture.svelte.ts";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

test("shows the waiting line only after the delay, and keeps the answer", async () => {
  const answer = deferred<string>();
  const before = Date.now();
  const { r, stop } = owned(() => resource(() => answer.promise, { delay: 20 }));
  expect([r.pending, r.loading, r.value]).toEqual([true, false, undefined]);
  await tick(30);
  expect(r.loading).toBe(true);
  answer.resolve("rows");
  await tick();
  expect([r.pending, r.loading, r.value, r.error]).toEqual([false, false, "rows", null]);
  expect(r.at).toBeGreaterThanOrEqual(before + 20);
  stop();
});

test("a fast answer never shows the waiting line", async () => {
  const { r, stop } = owned(() => resource(async () => "quick", { delay: 20 }));
  await tick(40);
  expect([r.loading, r.value]).toEqual([false, "quick"]);
  stop();
});

test("the latest request wins: an older, slower answer is dropped and aborted", async () => {
  const answers: Record<string, ReturnType<typeof deferred<string>>> = {};
  const signals: Record<string, AbortSignal> = {};
  const { r, set, stop } = owned((input) =>
    resource((signal) => {
      const q = input.query;
      signals[q] = signal;
      answers[q] = deferred<string>();
      return answers[q].promise;
    }),
  );
  set("ab");
  expect(signals.a?.aborted).toBe(true);
  answers.ab?.resolve("for ab");
  answers.a?.resolve("for a");
  await tick();
  expect(r.value).toBe("for ab");
  stop();
});

test("an error keeps the last answer, and reload asks again", async () => {
  let calls = 0;
  const { r, stop } = owned(() =>
    resource(async () => {
      calls++;
      if (calls === 2) throw new Error("PUBG is rate limiting");
      return `answer ${calls}`;
    }),
  );
  await tick();
  expect(r.value).toBe("answer 1");
  r.reload();
  await tick();
  expect([r.value, r.error]).toEqual(["answer 1", "PUBG is rate limiting"]);
  r.reload();
  await tick();
  expect([r.value, r.error]).toEqual(["answer 3", null]);
  stop();
});
