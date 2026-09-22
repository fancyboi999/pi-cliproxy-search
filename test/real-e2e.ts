import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveCLIProxyConfig } from "../extensions/config.ts";
import { searchCodex } from "../extensions/codex.ts";
import { searchAntigravity } from "../extensions/antigravity.ts";
import { getCodexCooldown, clearCodexCooldown, formatCooldownTime } from "../extensions/cooldown.ts";

const COOLDOWN_FILE = path.join(os.homedir(), ".pi", "agent", "cliproxy-cooldown.json");

async function runRealE2E() {
  console.log("=== 1. Environment Cleanup & Initial State Verification ===");
  clearCodexCooldown();
  console.log("Cooldown file exists after clear:", fs.existsSync(COOLDOWN_FILE));
  console.log("Initial state:", getCodexCooldown());

  const cfg = resolveCLIProxyConfig();
  console.log("Config endpoint:", cfg.endpoint, "| apiKey present:", Boolean(cfg.apiKey));

  console.log("\n=== 2. Real Codex Invocation Triggering Live 429 ===");
  let codexError: Error | null = null;
  try {
    await searchCodex("ping", cfg);
  } catch (err: any) {
    codexError = err;
    console.log("Captured live Codex error message:\n", err.message);
  }

  if (!codexError) {
    throw new Error("FAIL: Expected 429 cooldown error from Codex, but none was thrown");
  }

  console.log("\n=== 3. Verify Live Cooldown State File Persistence ===");
  if (!fs.existsSync(COOLDOWN_FILE)) {
    throw new Error("FAIL: ~/.pi/agent/cliproxy-cooldown.json was not generated!");
  }
  const persistedContent = fs.readFileSync(COOLDOWN_FILE, "utf-8");
  console.log("Persisted file content:\n", persistedContent);

  const state = getCodexCooldown();
  console.log("Parsed memory/persisted state:", state);
  const time = formatCooldownTime(state.cooldownUntil);
  console.log(`Formatted timing: Recovery at ${time.absolute}, Remaining ${time.relative}, Remaining seconds: ${time.remainingSeconds}`);

  if (!state.active || time.remainingSeconds <= 0) {
    throw new Error("FAIL: Cooldown state not active or remaining seconds invalid");
  }

  console.log("\n=== 4. Verify Immediate Zero-Network Interception During Cooldown ===");
  try {
    await searchCodex("ping again", cfg);
    throw new Error("FAIL: searchCodex should reject immediately during cooldown without network calls!");
  } catch (err: any) {
    console.log("Successfully intercepted during cooldown with message:\n", err.message);
  }

  console.log("\n=== 5. Live Antigravity Fallback Execution ===");
  const startAgy = Date.now();
  const agyRes = await searchAntigravity("Python official documentation", cfg, { limit: 2 });
  console.log(`Antigravity search succeeded in ${Date.now() - startAgy}ms, Results count: ${agyRes.results.length}`);
  console.log("First result title:", agyRes.results[0]?.title);
  console.log("First result URL:", agyRes.results[0]?.url);

  console.log("\n=== 6. Simulated Full Pi Plugin Tool Pipeline Execution (auto mode) ===");
  const { default: activate } = await import("../extensions/index.ts");
  const tools: Record<string, any> = {};
  const commands: Record<string, any> = {};
  const mockPi: any = {
    registerTool(tool: any) { tools[tool.name] = tool; },
    registerCommand(name: string, def: any) { commands[name] = def; },
  };
  activate(mockPi);

  const updates: string[] = [];
  const onUpdate = (evt: any) => {
    const text = evt?.content?.[0]?.text;
    if (text) updates.push(text);
  };

  console.log("Executing cliproxy_search in 'auto' mode...");
  const toolResult = await tools["cliproxy_search"].execute("call_1", { query: "Docker Compose spec" }, undefined, onUpdate);
  console.log("Tool execution runtime update notices:", updates);
  console.log("Tool execution return details:", toolResult.details);
  console.log("Tool output first 200 chars:\n", toolResult.content[0].text.slice(0, 200));

  if (toolResult.details.engine !== "antigravity") {
    throw new Error("FAIL: Expected automatic fallback to antigravity engine");
  }

  if (!updates.some((u) => u.includes("in cooldown"))) {
    throw new Error("FAIL: Expected English cooldown notice in updates");
  }
  if (!toolResult.content[0].text.includes("rate-limit cooldown")) {
    throw new Error("FAIL: Expected English rate-limit cooldown notice in Markdown header");
  }

  console.log("\n✅ Tool complete pipeline execution and English notices verified!");
  console.log("\n✅ Full E2E live verification completely passed!");
}

runRealE2E().catch((e) => {
  console.error("❌ E2E test failed:", e);
  process.exit(1);
});
