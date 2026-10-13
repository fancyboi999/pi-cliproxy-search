import type { CLIProxyConfig } from "./config.ts";

export const DEFAULT_ANTIGRAVITY_MODEL = "gemini-3.8-flash-high";

/**
 * Extracts numeric version from Gemini model IDs (e.g. "gemini-3.8-flash-high" -> 3.8).
 */
export function parseGeminiVersion(modelId: string): number {
  const match = modelId.match(/gemini-(\d+(?:\.\d+)?)/i);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Selects the optimal Antigravity grounding model from active models.
 * Prioritizes flash-high models with the highest version number (e.g. gemini-3.8-flash-high > gemini-3.7-flash-high),
 * followed by explicit antigravity models, then other gemini-flash models.
 */
export function selectBestAntigravityModel(modelIds: string[]): string | undefined {
  if (!modelIds || modelIds.length === 0) return undefined;

  // 1. Flash-high models sorted by version descending
  const flashHighModels = modelIds
    .filter((id) => id.includes("flash-high") || (id.startsWith("gemini") && id.includes("flash") && id.includes("high")))
    .sort((a, b) => parseGeminiVersion(b) - parseGeminiVersion(a));

  if (flashHighModels.length > 0) {
    return flashHighModels[0];
  }

  // 2. Explicit antigravity-named models
  const agyModel = modelIds.find((id) => id.includes("antigravity"));
  if (agyModel) return agyModel;

  // 3. Any Gemini flash models sorted by version descending
  const flashModels = modelIds
    .filter((id) => id.startsWith("gemini") && id.includes("flash"))
    .sort((a, b) => parseGeminiVersion(b) - parseGeminiVersion(a));

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
