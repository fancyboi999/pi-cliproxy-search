import assert from "node:assert";
import test from "node:test";
import { resolveCLIProxyConfig } from "../extensions/config.ts";
import { searchCodex } from "../extensions/codex.ts";
import { searchAntigravity } from "../extensions/antigravity.ts";
import { probeEngineCapabilities } from "../extensions/probe.ts";
import { getCodexCooldown } from "../extensions/cooldown.ts";

test("CLIProxy Engine Capabilities Probe", async () => {
  const cfg = resolveCLIProxyConfig();
  const caps = await probeEngineCapabilities(cfg, true);
  assert.ok(caps.models.length > 0, "should discover active registered models");
  assert.strictEqual(typeof caps.hasCodex, "boolean");
  assert.strictEqual(typeof caps.hasAntigravity, "boolean");
  console.log(`Capabilities probed: Codex=${caps.hasCodex}, Antigravity=${caps.hasAntigravity}, Models=${caps.models.length}`);
});

test("CLIProxy Config Resolution", () => {
  const cfg = resolveCLIProxyConfig();
  assert.ok(cfg.endpoint.startsWith("http"), "endpoint should be resolved");
  assert.ok(["config_file", "env", "local_yaml", "default"].includes(cfg.source));
  assert.ok(cfg.apiKey.length > 0, "apiKey should be resolved from config or env");
  console.log(`Config source: ${cfg.source}, endpoint: ${cfg.endpoint}`);
});

test("Codex Alpha Search Engine execution or cooldown interception", async () => {
  const cfg = resolveCLIProxyConfig();
  const cooldown = getCodexCooldown();

  if (cooldown.active) {
    console.log(`Codex is in cooldown, verifying that searchCodex safely rejects without network waste...`);
    await assert.rejects(
      async () => {
        await searchCodex("Go programming language", cfg, { limit: 3 });
      },
      /in cooldown|failed \(HTTP 429\)/i
    );
  } else {
    try {
      const resp = await searchCodex("Go programming language", cfg, { limit: 3 });
      assert.strictEqual(resp.engine, "codex");
      assert.ok(resp.results.length > 0, "should return search results");
      assert.ok(resp.results[0].url.startsWith("http"), "result url should be valid");
      assert.ok(resp.elapsedMs < 6000, `codex search took ${resp.elapsedMs}ms, expected under 6s`);
    } catch (err: any) {
      // If 429 triggers during execution, verify it gets recorded into cooldown
      assert.match(err.message, /HTTP 429|cooldown/i);
      const postCooldown = getCodexCooldown();
      assert.strictEqual(postCooldown.active, true, "should record cooldown on 429");
    }
  }
});

test("Antigravity Grounding Search Engine", { timeout: 35000 }, async () => {
  const cfg = resolveCLIProxyConfig();
  const resp = await searchAntigravity("Python language official website", cfg, { limit: 3 });
  assert.strictEqual(resp.engine, "antigravity");
  assert.ok(resp.results.length > 0, "should return grounding citations");
  assert.ok(resp.markdownSummary && resp.markdownSummary.length > 0, "should return summary");
});
