import type { CLIProxyConfig } from "./config.ts";

export const DEFAULT_ANTIGRAVITY_MODEL = "gemini-3.8-flash-high";

/**
 * Extracts numeric major and minor versions from Gemini model IDs
 * (e.g. "gemini-3.8-flash-high" -> [3, 8], "gemini-3.10-flash-high" -> [3, 10]).
 * Avoids the parseFloat("3.10") === 3.1 semver truncation bug.
 */
export function parseGeminiVersion(modelId: string): [number, number] {
  const match = modelId.match(/gemini-(\d+)(?:\.(\d+))?/i);
  return match ? [parseInt(match[1], 10), parseInt(match[2] || "0", 10)] : [0, 0];
}

function compareGeminiVersions(a: string, b: string): number {
  const [aMaj, aMin] = parseGeminiVersion(a);
  const [bMaj, bMin] = parseGeminiVersion(b);
  return bMaj - aMaj || bMin - aMin;
}

/**
 * Selects the optimal Antigravity grounding model from active models.
 * Prioritizes flash-high models with the highest version number (e.g. gemini-3.8-flash-high > gemini-3.7-flash-high),
 * followed by explicit antigravity models, then other gemini-flash models.
 */
export function selectBestAntigravityModel(modelIds: string[]): string | undefined {
  if (!modelIds || modelIds.length === 0) return undefined;

  // 1. Flash-high models sorted by semver descending
  const flashHighModels = modelIds
    .filter((id) => id.includes("flash-high"))
    .sort(compareGeminiVersions);

  if (flashHighModels.length > 0) {
    return flashHighModels[0];
  }

  // 2. Explicit antigravity-named models
  const agyModel = modelIds.find((id) => id.includes("antigravity"));
  if (agyModel) return agyModel;

  // 3. Any Gemini flash models sorted by semver descending
  const flashModels = modelIds
    .filter((id) => id.startsWith("gemini") && id.includes("flash"))
    .sort(compareGeminiVersions);

  if (flashModels.length > 0) {
    return flashModels[0];
  }

  return undefined;
}

export interface EngineCapabilities {
  hasCodex: boolean;
  hasAntigravity: boolean;
  antigravityModel?: string;
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
          antigravityModel: DEFAULT_ANTIGRAVITY_MODEL,
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

    const antigravityModel = selectBestAntigravityModel(modelIds) || (hasAntigravity ? DEFAULT_ANTIGRAVITY_MODEL : undefined);

    cachedCapabilities = {
      hasCodex,
      hasAntigravity,
      antigravityModel,
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
        antigravityModel: DEFAULT_ANTIGRAVITY_MODEL,
        models: [],
        lastChecked: now,
      }
    );
  }
}
