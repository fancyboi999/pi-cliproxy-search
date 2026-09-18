import crypto from "node:crypto";
import type { CLIProxyConfig } from "./config.js";
import type { SearchResponse, SearchItem, SearchOptions } from "./types.js";

interface CodexAlphaSearchRawResult {
  output?: string;
  results?: Array<{
    type?: string;
    domain?: string;
    ref_id?: string;
    snippet?: string;
    title?: string;
    url?: string;
  }>;
}

/**
 * Searches the web using Codex Alpha Search endpoint (/v1/alpha/search).
 * Extremely fast (~2s) raw search directly crawled by OpenAI's backend cluster.
 */
export async function searchCodex(
  query: string,
  cfg: CLIProxyConfig,
  options?: SearchOptions,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const startTime = Date.now();
  const limit = options?.limit ?? 5;
  const deep = options?.deep ?? false;

  const payload = {
    id: crypto.randomUUID(),
    model: "gpt-5.6-sol",
    commands: {
      search_query: [{ q: query }],
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) {
    headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  }

  const primaryUrl = `${cfg.endpoint}/v1/alpha/search`;
  const fallbackUrl = `${cfg.endpoint}/backend-api/codex/alpha/search`;

  let response: Response;
  try {
    response = await fetch(primaryUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (response.status === 404) {
      // Try alias fallback
      response = await fetch(fallbackUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
      });
    }
  } catch (err: any) {
    throw new Error(`Codex Alpha Search network failure: ${err?.message || err}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Codex Alpha Search failed (HTTP ${response.status}): ${errText}`);
  }

  const data = (await response.json()) as CodexAlphaSearchRawResult;
  const rawResults = data.results || [];

  const items: SearchItem[] = rawResults.slice(0, limit).map((r) => ({
    title: r.title || r.url || "Untitled",
    url: r.url || "",
    domain: r.domain || (r.url ? new URL(r.url).hostname : ""),
    snippet: r.snippet?.trim() || "",
  }));

  let rawMarkdownSnippet: string | undefined;
  if (deep && data.output) {
    // Truncate output to reasonable size (e.g., 6000 chars) to prevent context explosion
    rawMarkdownSnippet = data.output.slice(0, 6000);
  }

  return {
    engine: "codex",
    query,
    results: items,
    rawMarkdownSnippet,
    elapsedMs: Date.now() - startTime,
  };
}
