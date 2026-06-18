import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHALLENGE_INTERVAL_MS,
  createRequestLimiter,
  DANMAKU_SPEED_FACTOR,
  DEFAULT_DANMAKU_INTERVAL_MS,
  MAX_DANMAKU_CONCURRENCY,
  scaleDanmakuDuration
} from "../public/request-limiter.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

test("allows at most two concurrent danmaku requests", async () => {
  const limiter = createRequestLimiter(2);
  const tasks = [deferred(), deferred(), deferred()];
  const running = tasks.map((task) => limiter.tryRun(() => task.promise));

  assert.equal(limiter.active, 2);
  assert.equal(running[2], null);

  tasks[0].resolve("done");
  assert.equal(await running[0], "done");
  assert.equal(limiter.active, 1);

  const replacement = limiter.tryRun(() => tasks[2].promise);
  assert.ok(replacement);
  assert.equal(limiter.active, 2);

  tasks[1].resolve();
  tasks[2].resolve();
  await Promise.all([running[1], replacement]);
  assert.equal(limiter.active, 0);
});

test("releases a concurrency slot when a request fails", async () => {
  const limiter = createRequestLimiter(1);
  const task = deferred();
  const running = limiter.tryRun(() => task.promise);
  task.reject(new Error("network failed"));
  await assert.rejects(running, /network failed/);
  assert.equal(limiter.active, 0);
  const retry = limiter.tryRun(() => Promise.resolve("retry"));
  assert.equal(await retry, "retry");
  assert.equal(limiter.active, 0);
});

test("uses a 2000ms danmaku default and an independent 800ms challenge interval", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.equal(MAX_DANMAKU_CONCURRENCY, 2);
  assert.equal(DEFAULT_DANMAKU_INTERVAL_MS, 2000);
  assert.equal(CHALLENGE_INTERVAL_MS, 800);
  assert.match(html, /id="intervalRange"[^>]+value="2000"/);
  assert.match(html, /id="intervalValue">2000ms</);
});

test("starts at 0ms and 2000ms, then skips while both slots are occupied", async () => {
  const limiter = createRequestLimiter(MAX_DANMAKU_CONCURRENCY);
  const starts = [];
  const tasks = [deferred(), deferred(), deferred()];
  const simulatedTicks = [0, 2000, 4000];
  const running = simulatedTicks.map((now, index) => limiter.tryRun(() => {
    starts.push(now);
    return tasks[index].promise;
  }));

  await Promise.resolve();
  assert.deepEqual(starts, [0, 2000]);
  assert.equal(running[2], null);

  tasks.slice(0, 2).forEach((task) => task.resolve());
  await Promise.all(running.slice(0, 2));
});

test("moves danmaku at 0.75x speed by extending animation duration", () => {
  assert.equal(DANMAKU_SPEED_FACTOR, 0.75);
  assert.equal(scaleDanmakuDuration(6), 8);
  assert.equal(scaleDanmakuDuration(9), 12);
});

test("places scene input outside the danmaku panel and includes it in every analysis context", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="sceneInput"') < html.indexOf('id="panel-danmaku"'));
  assert.match(html, /场景输入（全部模式生效）/);
  assert.match(app, /const sceneContext = \[\s*confirmedSceneContext,/);
});
