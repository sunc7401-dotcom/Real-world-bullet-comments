export const MAX_DANMAKU_CONCURRENCY = 2;
export const DEFAULT_DANMAKU_INTERVAL_MS = 2000;
export const CHALLENGE_INTERVAL_MS = 800;
export const DANMAKU_SPEED_FACTOR = 0.75;

export function scaleDanmakuDuration(baseDurationSeconds, speedFactor = DANMAKU_SPEED_FACTOR) {
  const duration = Number(baseDurationSeconds);
  const speed = Number(speedFactor);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("baseDurationSeconds must be positive");
  if (!Number.isFinite(speed) || speed <= 0) throw new Error("speedFactor must be positive");
  return duration / speed;
}

export function createRequestLimiter(maxConcurrent = MAX_DANMAKU_CONCURRENCY) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error("maxConcurrent must be a positive integer");
  }

  let active = 0;
  return {
    get active() {
      return active;
    },
    get maxConcurrent() {
      return maxConcurrent;
    },
    tryRun(task) {
      if (typeof task !== "function") throw new TypeError("task must be a function");
      if (active >= maxConcurrent) return null;
      active += 1;
      return Promise.resolve()
        .then(task)
        .finally(() => {
          active -= 1;
        });
    }
  };
}
