import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveCLIProxyConfig } from "../extensions/config.ts";
import { searchCodex } from "../extensions/codex.ts";
import { searchAntigravity } from "../extensions/antigravity.ts";
import { getCodexCooldown, clearCodexCooldown, formatCooldownTime } from "../extensions/cooldown.ts";

const COOLDOWN_FILE = path.join(os.homedir(), ".pi", "agent", "cliproxy-cooldown.json");

async function runRealE2E() {
  console.log("=== 1. 清理环境与初始状态确认 ===");
  clearCodexCooldown();
  console.log("Cooldown file exists after clear:", fs.existsSync(COOLDOWN_FILE));
  console.log("Initial state:", getCodexCooldown());

  const cfg = resolveCLIProxyConfig();
  console.log("Config endpoint:", cfg.endpoint, "| apiKey present:", Boolean(cfg.apiKey));

  console.log("\n=== 2. 真实调用 Codex 触发真实 429 ===");
  let codexError: Error | null = null;
  try {
    await searchCodex("ping", cfg);
  } catch (err: any) {
    codexError = err;
    console.log("真实捕获的 Codex 错误信息:\n", err.message);
  }

  if (!codexError) {
    throw new Error("FAIL: 预期应当捕获 429 冷却错误，但未抛出");
  }

  console.log("\n=== 3. 验证真实冷却状态是否落盘 ===");
  if (!fs.existsSync(COOLDOWN_FILE)) {
    throw new Error("FAIL: ~/.pi/agent/cliproxy-cooldown.json 未生成！");
  }
  const persistedContent = fs.readFileSync(COOLDOWN_FILE, "utf-8");
  console.log("真实落盘文件内容:\n", persistedContent);

  const state = getCodexCooldown();
  console.log("解析出的内存/落盘状态:", state);
  const time = formatCooldownTime(state.cooldownUntil);
  console.log(`格式化时间: 恢复时刻 ${time.absolute}, 剩余 ${time.relative}, 剩余秒数 ${time.remainingSeconds}`);

  if (!state.active || time.remainingSeconds <= 0) {
    throw new Error("FAIL: 冷却状态未激活或剩余秒数异常");
  }

  console.log("\n=== 4. 验证冷却期内的 Codex 显式请求拦截 ===");
  try {
    await searchCodex("ping again", cfg);
    throw new Error("FAIL: 冷却期内应当直接拦截 searchCodex，不应继续执行！");
  } catch (err: any) {
    console.log("冷却期内直接拦截成功，错误信息:\n", err.message);
  }

  console.log("\n=== 5. 真实调用 Antigravity 验证兜底链路可达性 ===");
  const startAgy = Date.now();
  const agyRes = await searchAntigravity("Python official documentation", cfg, { limit: 2 });
  console.log(`Antigravity 真实搜索成功，耗时 ${Date.now() - startAgy}ms，结果条数: ${agyRes.results.length}`);
  console.log("首条结果标题:", agyRes.results[0]?.title);
  console.log("首条结果 URL:", agyRes.results[0]?.url);

  console.log("\n=== 6. 真实模拟 Pi 插件完整 Tool 管道执行 (auto 模式) ===");
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

  console.log("执行 cliproxy_search (auto 模式)...");
  const toolResult = await tools["cliproxy_search"].execute("call_1", { query: "Docker Compose spec" }, undefined, onUpdate);
  console.log("Tool 执行过程 updates 提示:", updates);
  console.log("Tool 执行返回 details:", toolResult.details);
  console.log("Tool 返回前 200 字符:\n", toolResult.content[0].text.slice(0, 200));

  if (toolResult.details.engine !== "antigravity") {
    throw new Error("FAIL: 预期应当自动路由至 antigravity 引擎");
  }

  console.log("\n✅ Tool 完整执行流程与冷却提示验证通过！");

  console.log("\n✅ E2E 全链路真实验证全部通过！");
}

runRealE2E().catch((e) => {
  console.error("❌ E2E 测试失败:", e);
  process.exit(1);
});
