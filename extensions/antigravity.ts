import type { CLIProxyConfig } from "./config.ts";
import type { SearchResponse, SearchItem, SearchOptions } from "./types.ts";

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

  const payload = {
    model: "gemini-3.7-flash-high",
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
  const seenUrls = new Set<string>();

  let summaryText = "";

  for (const block of data.content || []) {
    if (block.type === "text" && block.text) {
      summaryText += block.text;
      // Extract inline citations if present
      for (const cit of block.citations || []) {
        if (cit.url && !seenUrls.has(cit.url)) {
          seenUrls.add(cit.url);
          items.push({
            title: cit.title || cit.url,
            url: cit.url,
            domain: new URL(cit.url).hostname,
            snippet: cit.cited_text || "",
          });
        }
      }
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const res of block.content) {
        if (res.url && !seenUrls.has(res.url)) {
          seenUrls.add(res.url);
          items.push({
            title: res.title || res.url,
            url: res.url,
            domain: new URL(res.url).hostname,
            snippet: "",
          });
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
