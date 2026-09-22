import type { CLIProxyConfig } from "./config.ts";

export interface EngineCapabilities {
  hasCodex: boolean;
  hasAntigravity: boolean;
  models: string[];
  lastChecked: number;
}

let cachedCapabilities: EngineCapabilities | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute cache

/**
 * Dynamically probes the local CLIProxyAPI instance to detect
 * which upstream accounts/engines are currently mounted and healthy.
 */
export async function probeEngineCapabilities(
  cfg: CLIProxyConfig,
  forceRefresh = false
): Promise<EngineCapabilities> {
  const now = Date.now();
  if (!forceRefresh && cachedCapabilities && now - cachedCapabilities.lastChecked < CACHE_TTL_MS) {
    return cachedCapabilities;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) {
    headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${cfg.endpoint}/v1/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      // If /v1/models fails, assume optimistic presence if previous cache existed
      return (
        cachedCapabilities || {
          hasCodex: true,
          hasAntigravity: true,
          models: [],
          lastChecked: now,
        }
      );
    }

    const json = (await res.json()) as { data?: Array<{ id: string }> };
    const modelIds = (json.data || []).map((m) => m.id.toLowerCase());

    const hasCodex = modelIds.some(
      (id) =>
        id.startsWith("gpt-5") ||
        id.startsWith("gpt-6") ||
        id.includes("codex")
    );

    const hasAntigravity = modelIds.some(
      (id) =>
        id.startsWith("gemini") ||
        id.includes("antigravity")
    );

    cachedCapabilities = {
      hasCodex,
      hasAntigravity,
      models: modelIds,
      lastChecked: now,
    };

    return cachedCapabilities;
  } catch {
    // Network failure to /v1/models: fallback to default assumptions
    return (
      cachedCapabilities || {
        hasCodex: true,
        hasAntigravity: true,
        models: [],
        lastChecked: now,
      }
    );
  }
}
