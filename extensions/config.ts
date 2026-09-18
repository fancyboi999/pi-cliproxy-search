import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type ConfigSource = "config_file" | "env" | "local_yaml" | "default";

export interface CLIProxyConfig {
  endpoint: string;
  apiKey: string;
  source: ConfigSource;
  configFilePath?: string;
}

const PRIMARY_CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "cliproxy-search.json");
const FALLBACK_CONFIG_PATH = path.join(os.homedir(), ".pi", "cliproxy-search.json");

/**
 * Resolves CLIProxyAPI endpoint and API Key with cascading hierarchy:
 * 1. Dedicated config file (~/.pi/agent/cliproxy-search.json or ~/.pi/cliproxy-search.json)
 *    Ideal for remote VPS / Tailscale / LAN instances.
 * 2. Environment variables (CLIPROXY_SEARCH_ENDPOINT / CLIPROXY_ENDPOINT, CLIPROXY_API_KEY)
 *    Ideal for Docker / CI / script environments.
 * 3. Local auto-detection (~/.cli-proxy-api/config.yaml)
 *    Zero-config for local users.
 * 4. Default loopback fallback (http://127.0.0.1:8317)
 */
export function resolveCLIProxyConfig(): CLIProxyConfig {
  // 1. Check dedicated JSON config file
  for (const cfgPath of [PRIMARY_CONFIG_PATH, FALLBACK_CONFIG_PATH]) {
    if (fs.existsSync(cfgPath)) {
      try {
        const raw = fs.readFileSync(cfgPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.endpoint || parsed.apiKey) {
          return {
            endpoint: (parsed.endpoint || "http://127.0.0.1:8317").replace(/\/+$/, ""),
            apiKey: parsed.apiKey || "",
            source: "config_file",
            configFilePath: cfgPath,
          };
        }
      } catch {}
    }
  }

  // 2. Check environment variables
  const envEndpoint = process.env.CLIPROXY_SEARCH_ENDPOINT || process.env.CLIPROXY_ENDPOINT;
  const envKey = process.env.CLIPROXY_API_KEY;
  if (envEndpoint || envKey) {
    return {
      endpoint: (envEndpoint || "http://127.0.0.1:8317").replace(/\/+$/, ""),
      apiKey: envKey || "",
      source: "env",
    };
  }

  // 3. Check local CLIProxyAPI config.yaml for automatic zero-config detection
  const localYamlPath = path.join(os.homedir(), ".cli-proxy-api", "config.yaml");
  if (fs.existsSync(localYamlPath)) {
    try {
      const content = fs.readFileSync(localYamlPath, "utf-8");
      const hostMatch = content.match(/^host:\s*["']?([^"'\s]+)["']?/m);
      const portMatch = content.match(/^port:\s*(\d+)/m);
      const host = hostMatch ? hostMatch[1] : "127.0.0.1";
      const port = portMatch ? portMatch[1] : "8317";
      const endpoint = `http://${host}:${port}`.replace(/\/+$/, "");

      const keyMatch = content.match(/api-keys:\s*\n\s*-\s*["']?([a-zA-Z0-9_-]+)["']?/m);
      const apiKey = keyMatch ? keyMatch[1] : "";

      return {
        endpoint,
        apiKey,
        source: "local_yaml",
        configFilePath: localYamlPath,
      };
    } catch {}
  }

  // 4. Fallback default
  return {
    endpoint: "http://127.0.0.1:8317",
    apiKey: "",
    source: "default",
  };
}

/**
 * Persists custom endpoint & key to ~/.pi/agent/cliproxy-search.json.
 */
export function saveCLIProxyConfigFile(updates: { endpoint?: string; apiKey?: string }): string {
  const dir = path.dirname(PRIMARY_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let current: any = {};
  if (fs.existsSync(PRIMARY_CONFIG_PATH)) {
    try {
      current = JSON.parse(fs.readFileSync(PRIMARY_CONFIG_PATH, "utf-8"));
    } catch {}
  }

  const next = {
    ...current,
    ...(updates.endpoint ? { endpoint: updates.endpoint.replace(/\/+$/, "") } : {}),
    ...(updates.apiKey !== undefined ? { apiKey: updates.apiKey } : {}),
  };

  fs.writeFileSync(PRIMARY_CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  return PRIMARY_CONFIG_PATH;
}
