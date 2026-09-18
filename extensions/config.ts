import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface CLIProxyConfig {
  endpoint: string;
  apiKey: string;
}

/**
 * Resolves CLIProxyAPI endpoint and API Key.
 * Priority:
 * 1. Environment variables: CLIPROXY_SEARCH_ENDPOINT / CLIPROXY_ENDPOINT, CLIPROXY_API_KEY
 * 2. Local config file: ~/.cli-proxy-api/config.yaml
 * 3. Default loopback fallback: http://127.0.0.1:8317
 */
export function resolveCLIProxyConfig(): CLIProxyConfig {
  let endpoint = process.env.CLIPROXY_SEARCH_ENDPOINT || process.env.CLIPROXY_ENDPOINT || "";
  let apiKey = process.env.CLIPROXY_API_KEY || "";

  // Attempt to load from ~/.cli-proxy-api/config.yaml if not fully specified
  if (!endpoint || !apiKey) {
    const configPath = path.join(os.homedir(), ".cli-proxy-api", "config.yaml");
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        
        if (!endpoint) {
          const hostMatch = content.match(/^host:\s*["']?([^"'\s]+)["']?/m);
          const portMatch = content.match(/^port:\s*(\d+)/m);
          const host = hostMatch ? hostMatch[1] : "127.0.0.1";
          const port = portMatch ? portMatch[1] : "8317";
          endpoint = `http://${host}:${port}`;
        }

        if (!apiKey) {
          // Look for api-keys: \n - "..."
          const keyMatch = content.match(/api-keys:\s*\n\s*-\s*["']?([a-zA-Z0-9_-]+)["']?/m);
          if (keyMatch) {
            apiKey = keyMatch[1];
          }
        }
      } catch {
        // Fall back to defaults
      }
    }
  }

  if (!endpoint) {
    endpoint = "http://127.0.0.1:8317";
  }

  // Remove trailing slash
  endpoint = endpoint.replace(/\/+$/, "");

  return {
    endpoint,
    apiKey,
  };
}
