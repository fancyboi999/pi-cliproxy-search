import type { CLIProxyConfig } from "./config.ts";
import type { SearchResponse, SearchItem, SearchOptions } from "./types.ts";
import {
  DEFAULT_ANTIGRAVITY_MODEL,
  selectBestAntigravityModel,
  probeEngineCapabilities,
} from "./probe.ts";

export { DEFAULT_ANTIGRAVITY_MODEL, selectBestAntigravityModel };

/**
 * Resolves the effective Antigravity model name following hierarchy:
 * 1. Explicit model option
 * 2. Environment variable (CLIPROXY_ANTIGRAVITY_MODEL or ANTIGRAVITY_MODEL)
 * 3. Probed active capabilities from CLIProxyAPI
 * 4. Fallback default (DEFAULT_ANTIGRAVITY_MODEL)
 */
export async function resolveAntigravityModel(
  cfg?: CLIProxyConfig,
  explicitModel?: string
): Promise<string> {
  if (explicitModel && explicitModel.trim()) {
    return explicitModel.trim();
  }

  const envModel = process.env.CLIPROXY_ANTIGRAVITY_MODEL || process.env.ANTIGRAVITY_MODEL;
  if (envModel && envModel.trim()) {
    return envModel.trim();
  }

  if (cfg) {
    try {
      const caps = await probeEngineCapabilities(cfg);
      if (caps.antigravityModel) {
        return caps.antigravityModel;
      }
    } catch {}
  }

  return DEFAULT_ANTIGRAVITY_MODEL;
}

interface AnthropicMessageResponse {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content?: Array<{
    type: string;
    text?: string;
    citations?: Array<{
      type?: string;
      title?: string;
      url?: string;
      cited_text?: string;
    }>;
    id?: string;
    name?: string;
    input?: { query?: string };
    tool_use_id?: string;
    content?: Array<{
      type: string;
      title?: string;
      url?: string;
      page_age?: string | null;
    }>;
  }>;
}

/**
 * Searches the web using Google Antigravity Grounding via /v1/messages.
 * Leverages Google's native grounding search and authoritative citation metadata.
 */
export async function searchAntigravity(
  query: string,
  cfg: CLIProxyConfig,
  options?: SearchOptions,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const startTime = Date.now();
  const limit = options?.limit ?? 5;
  const targetModel = await resolveAntigravityModel(cfg, options?.model);

  const payload = {
    model: targetModel,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Please search online to answer this query: "${query}". Provide a concise summary and references.`,
      },
    ],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
      },
    ],
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (cfg.apiKey) {
    headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  }

  const url = `${cfg.endpoint}/v1/messages`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: any) {
    throw new Error(`Antigravity Search network failure: ${err?.message || err}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Antigravity Search failed (HTTP ${response.status}): ${errText}`);
  }

  const data = (await response.json()) as AnthropicMessageResponse;
  const items: SearchItem[] = [];
  const urlMap = new Map<string, SearchItem>();

  let summaryText = "";

  for (const block of data.content || []) {
    if (block.type === "text" && block.text) {
      summaryText += block.text;
      // Extract inline citations if present
      for (const cit of block.citations || []) {
        if (!cit.url) continue;
        const existing = urlMap.get(cit.url);
        if (existing) {
          if (!existing.snippet && cit.cited_text) {
            existing.snippet = cit.cited_text;
          }
          if ((!existing.title || existing.title === existing.url) && cit.title) {
            existing.title = cit.title;
          }
        } else {
          let domain: string | undefined;
          try {
            domain = new URL(cit.url).hostname;
          } catch {}
          const item: SearchItem = {
            title: cit.title || cit.url,
            url: cit.url,
            domain,
            snippet: cit.cited_text || "",
          };
          urlMap.set(cit.url, item);
          items.push(item);
        }
      }
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const res of block.content) {
        if (!res.url) continue;
        const existing = urlMap.get(res.url);
        if (existing) {
          if ((!existing.title || existing.title === existing.url) && res.title) {
            existing.title = res.title;
          }
        } else {
          let domain: string | undefined;
          try {
            domain = new URL(res.url).hostname;
          } catch {}
          const item: SearchItem = {
            title: res.title || res.url,
            url: res.url,
            domain,
            snippet: "",
          };
          urlMap.set(res.url, item);
          items.push(item);
        }
      }
    }
  }

  return {
    engine: "antigravity",
    query,
    results: items.slice(0, limit),
    markdownSummary: summaryText.trim(),
    elapsedMs: Date.now() - startTime,
  };
}
