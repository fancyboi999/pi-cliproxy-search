import assert from "node:assert";
import test from "node:test";
import {
  getCodexCooldown,
  recordCodexCooldown,
  clearCodexCooldown,
  formatCooldownTime,
} from "../extensions/cooldown.ts";

test("Cooldown Time Formatting", () => {
  const now = Date.now();

  const formattedShort = formatCooldownTime(now + 45 * 1000);
  assert.strictEqual(formattedShort.relative, "45s");
  assert.strictEqual(formattedShort.remainingSeconds, 45);

  const formattedMins = formatCooldownTime(now + (15 * 60 + 30) * 1000);
  assert.strictEqual(formattedMins.relative, "15m 30s");
  assert.strictEqual(formattedMins.remainingSeconds, 930);

  const formattedHours = formatCooldownTime(now + (2 * 3600 + 10 * 60 + 5) * 1000);
  assert.strictEqual(formattedHours.relative, "2h 10m 5s");
  assert.ok(formattedHours.absolute.includes(":"), "should format absolute local clock time");
});

test("Cooldown Recording and Automatic Retrieval", () => {
  clearCodexCooldown();

  const initial = getCodexCooldown();
  assert.strictEqual(initial.active, false, "should be inactive initially");

  // Simulate realistic CLIProxyAPI 429 payload
  const rawBody = JSON.stringify({
    error: JSON.stringify({
      code: "model_cooldown",
      last_upstream_error: "usage_limit_reached: The usage limit has been reached",
      message: "All credentials for model gpt-5.6-sol are cooling down",
      model: "gpt-5.6-sol",
      provider: "codex",
      reset_seconds: 1200,
      reset_time: "20m0s",
    }),
  });

  const recorded = recordCodexCooldown(429, { "retry-after": "1200" }, rawBody);
  assert.strictEqual(recorded.active, true);
  assert.strictEqual(recorded.resetSeconds, 1200);
  assert.strictEqual(recorded.resetTimeStr, "20m0s");
  assert.ok(recorded.reason?.includes("usage_limit_reached"));

  const retrieved = getCodexCooldown();
  assert.strictEqual(retrieved.active, true);
  assert.strictEqual(retrieved.resetSeconds, 1200);

  // Clear cooldown
  clearCodexCooldown();
  const cleared = getCodexCooldown();
  assert.strictEqual(cleared.active, false);
});

test("Cooldown Fallback when retry-after header only", () => {
  clearCodexCooldown();

  const recorded = recordCodexCooldown(429, { "retry-after": "60" }, "Generic 429 body");
  assert.strictEqual(recorded.active, true);
  assert.strictEqual(recorded.resetSeconds, 60);

  clearCodexCooldown();
});

test("Cooldown Fallback to 300s when 429 without any reset info", () => {
  clearCodexCooldown();

  const recorded = recordCodexCooldown(429, {}, "Some unexpected 429 error");
  assert.strictEqual(recorded.active, true);
  assert.strictEqual(recorded.resetSeconds, 300);

  clearCodexCooldown();
});

test("Cooldown Automatic Expiration", async () => {
  clearCodexCooldown();

  // Record a tiny cooldown (1 second)
  recordCodexCooldown(429, { "retry-after": "1" }, "");
  const activeState = getCodexCooldown();
  assert.strictEqual(activeState.active, true);

  // Wait 1.1s for expiration
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const expiredState = getCodexCooldown();
  assert.strictEqual(expiredState.active, false, "cooldown should automatically expire after timeout");
});
