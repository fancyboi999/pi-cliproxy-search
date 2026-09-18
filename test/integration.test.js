import assert from "node:assert";
import test from "node:test";
import { resolveCLIProxyConfig } from "../extensions/config.js";
import { searchCodex } from "../extensions/codex.js";
import { searchAntigravity } from "../extensions/antigravity.js";
import { probeEngineCapabilities } from "../extensions/probe.js";

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
  assert.ok(cfg.apiKey.length > 0, "apiKey should be resolved from config.yaml or env");
});

test("Codex Alpha Search Engine (~2s real execution)", async () => {
  const cfg = resolveCLIProxyConfig();
  const resp = await searchCodex("Go programming language", cfg, { limit: 3 });
  assert.strictEqual(resp.engine, "codex");
  assert.ok(resp.results.length > 0, "should return search results");
  assert.ok(resp.results[0].url.startsWith("http"), "result url should be valid");
  assert.ok(resp.elapsedMs < 6000, `codex search took ${resp.elapsedMs}ms, expected under 6s`);
});

test("Antigravity Grounding Search Engine", { timeout: 15000 }, async () => {
  const cfg = resolveCLIProxyConfig();
  const resp = await searchAntigravity("Python language official website", cfg, { limit: 3 });
  assert.strictEqual(resp.engine, "antigravity");
  assert.ok(resp.results.length > 0, "should return grounding citations");
  assert.ok(resp.markdownSummary && resp.markdownSummary.length > 0, "should return summary");
});
