import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveCLIProxyConfig, saveCLIProxyConfigFile } from "./config.js";
import { searchCodex } from "./codex.js";
import { searchAntigravity } from "./antigravity.js";
import { probeEngineCapabilities } from "./probe.js";
import { fetchWebPage } from "./fetch.js";
import type { SearchResponse, SearchOptions } from "./types.js";

function maskApiKey(key: string): string {
  if (!key) return "(none / public)";
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function formatSearchResults(resp: SearchResponse): string {
  const engineBadge = resp.engine === "codex" ? "Codex Alpha Search" : "Google Antigravity Grounding";
  const header = `### Web Search Results (${engineBadge}, ${resp.elapsedMs}ms)\n\n**Query:** \`${resp.query}\`\n`;

  let body = "";

  if (resp.markdownSummary) {
    body += `${resp.markdownSummary}\n\n`;
  }

  if (resp.results.length > 0) {
    body += `**Sources & References:**\n`;
    for (let i = 0; i < resp.results.length; i++) {
      const item = resp.results[i];
      const title = item.title || item.url;
      const snippet = item.snippet ? `\n> ${item.snippet.replace(/\n+/g, " ")}` : "";
      body += `${i + 1}. [${title}](${item.url})${snippet}\n`;
    }
  } else if (!resp.markdownSummary) {
    body += `_No search results found._\n`;
  }

  if (resp.rawMarkdownSnippet) {
    body += `\n<details>\n<summary>Raw Web Content Extracts</summary>\n\n${resp.rawMarkdownSnippet}\n\n</details>\n`;
  }

  return header + "\n" + body.trim();
}

export default function activate(pi: ExtensionAPI) {
  let config = resolveCLIProxyConfig();

  const searchParameters = Type.Object({
    query: Type.String({
      description: "The web search query string.",
      minLength: 1,
    }),
    engine: Type.Optional(
      Type.Union([
        Type.Literal("auto"),
        Type.Literal("codex"),
        Type.Literal("antigravity"),
      ], {
        description: "Search engine routing: 'auto' (dynamic account discovery & fallback), 'codex', or 'antigravity'.",
        default: "auto",
      })
    ),
    deep: Type.Optional(
      Type.Boolean({
        description: "When true, includes raw markdown article extracts from crawled pages. Defaults to false.",
        default: false,
      })
    ),
    limit: Type.Optional(
      Type.Integer({
        description: "Maximum number of source results to return (1-10, default 5).",
        minimum: 1,
        maximum: 10,
        default: 5,
      })
    ),
  });

  async function executeSearch(
    params: { query: string; engine?: "auto" | "codex" | "antigravity"; deep?: boolean; limit?: number },
    signal?: AbortSignal,
    onUpdate?: any
  ) {
    // Re-resolve in case config was changed at runtime
    config = resolveCLIProxyConfig();

    const query = params.query.trim();
    const requestedEngine = params.engine ?? "auto";
    const options: SearchOptions = {
      engine: requestedEngine,
      limit: params.limit ?? 5,
      deep: params.deep ?? false,
    };

    let result: SearchResponse;

    if (requestedEngine === "codex") {
      onUpdate?.({ content: [{ type: "text", text: `Searching CLIProxyAPI (Codex Alpha Search)...` }] });
      result = await searchCodex(query, config, options, signal);
    } else if (requestedEngine === "antigravity") {
      onUpdate?.({ content: [{ type: "text", text: `Searching CLIProxyAPI (Google Antigravity Grounding)...` }] });
      result = await searchAntigravity(query, config, options, signal);
    } else {
      // Dynamic Auto-discovery & Tiered Fallback
      const capabilities = await probeEngineCapabilities(config);

      if (!capabilities.hasCodex && capabilities.hasAntigravity) {
        onUpdate?.({ content: [{ type: "text", text: `Codex credentials not mounted, using Antigravity Google Grounding...` }] });
        result = await searchAntigravity(query, config, options, signal);
      } else if (capabilities.hasCodex && !capabilities.hasAntigravity) {
        onUpdate?.({ content: [{ type: "text", text: `Antigravity not mounted, using Codex Alpha Search...` }] });
        result = await searchCodex(query, config, options, signal);
      } else if (!capabilities.hasCodex && !capabilities.hasAntigravity) {
        // Neither engine detected in /v1/models: try Codex first optimistically, then Antigravity
        try {
          onUpdate?.({ content: [{ type: "text", text: `Probing Codex Alpha Search...` }] });
          result = await searchCodex(query, config, options, signal);
        } catch (err: any) {
          onUpdate?.({ content: [{ type: "text", text: `Codex failed (${err?.message}), attempting Antigravity fallback...` }] });
          result = await searchAntigravity(query, config, options, signal);
        }
      } else {
        // Both engines available: Codex first (~2s speed), fallback to Antigravity if any error occurs
        try {
          onUpdate?.({ content: [{ type: "text", text: `Searching CLIProxyAPI (Codex ~2s fast route)...` }] });
          result = await searchCodex(query, config, options, signal);
        } catch (codexErr: any) {
          onUpdate?.({
            content: [{ type: "text", text: `Codex unavailable (${codexErr?.message || "transient error"}), falling back to Antigravity...` }],
          });
          try {
            result = await searchAntigravity(query, config, options, signal);
          } catch (agyErr: any) {
            throw new Error(
              `All local search engines failed. Codex: ${codexErr?.message || "error"}; Antigravity: ${agyErr?.message || "error"}. Run /cliproxy-status to diagnose.`
            );
          }
        }
      }
    }

    const formattedText = formatSearchResults(result);

    return {
      content: [{ type: "text" as const, text: formattedText }],
      details: {
        engine: result.engine,
        elapsedMs: result.elapsedMs,
        resultCount: result.results.length,
      },
    };
  }

  const fetchParameters = Type.Object({
    url: Type.String({
      description: "The web page URL to fetch and convert into clean Markdown (e.g. documentation, articles, PRs).",
      minLength: 1,
    }),
    maxChars: Type.Optional(
      Type.Integer({
        description: "Maximum characters of Markdown to return (default 15000, set to 0 for unlimited).",
        minimum: 0,
        default: 15000,
      })
    ),
  });

  async function executeFetch(
    params: { url: string; maxChars?: number },
    signal?: AbortSignal,
    onUpdate?: any
  ) {
    onUpdate?.({ content: [{ type: "text", text: `Fetching and extracting clean markdown from ${params.url}...` }] });
    const res = await fetchWebPage(params.url, { maxChars: params.maxChars }, signal);

    let header = `### Web Page Content (${res.engine === "jina" ? "Jina Reader" : "Direct Fetch"}, ${res.elapsedMs}ms)\n\n`;
    if (res.title) {
      header += `**Title:** ${res.title}\n`;
    }
    header += `**URL:** ${res.url}\n\n---\n\n`;

    return {
      content: [{ type: "text" as const, text: header + res.content }],
      details: {
        engine: res.engine,
        elapsedMs: res.elapsedMs,
        truncated: res.truncated,
        totalChars: res.totalChars,
      },
    };
  }

  // Register cliproxy_search
  pi.registerTool({
    name: "cliproxy_search",
    label: "CLIProxy Search",
    description:
      "High-speed, multi-engine web search powered by CLIProxyAPI. Automatically discovers active accounts (Codex Alpha Search ~2s and Google Antigravity Grounding) with intelligent fallback.",
    promptSnippet: "Search the web with CLIProxyAPI using Codex Alpha Search (~2s) or Google Antigravity Grounding",
    promptGuidelines: [
      "Use cliproxy_search when you need real-time documentation, recent news, bug fixes, or online knowledge.",
      "Prefer deep=false for rapid verification to save tokens, and deep=true when comprehensive page reading is required."
    ],
    parameters: searchParameters,
    async execute(_toolCallId, params, signal, onUpdate) {
      return executeSearch(params, signal, onUpdate);
    },
  });

  // Also register web_search if not already occupied to provide a drop-in replacement
  try {
    pi.registerTool({
      name: "web_search",
      label: "Web Search (CLIProxy)",
      description: "Search the web via CLIProxyAPI Codex/Antigravity engines.",
      parameters: searchParameters,
      async execute(_toolCallId, params, signal, onUpdate) {
        return executeSearch(params, signal, onUpdate);
      },
    });
  } catch {
    // web_search may already be registered by another extension; cliproxy_search remains available
  }

  // Register cliproxy_fetch
  pi.registerTool({
    name: "cliproxy_fetch",
    label: "CLIProxy Fetch",
    description:
      "Fetch any web page URL and extract its clean, high-fidelity Markdown content via Jina Reader (with local fallback). Eliminates HTML boilerplate, bypasses Cloudflare/SPAs, and avoids LLM summary bias.",
    promptSnippet: "Fetch web pages and extract clean Markdown content without LLM summary bias",
    promptGuidelines: [
      "Use cliproxy_fetch or web_fetch when you need to read the exact full text, code blocks, or documentation from a specific URL.",
      "Prefer fetch over curl for HTML pages to eliminate noise and save tokens."
    ],
    parameters: fetchParameters,
    async execute(_toolCallId, params, signal, onUpdate) {
      return executeFetch(params, signal, onUpdate);
    },
  });

  // Also register web_fetch if not already occupied to provide a drop-in replacement
  try {
    pi.registerTool({
      name: "web_fetch",
      label: "Web Fetch (CLIProxy)",
      description: "Fetch any web page URL and extract clean Markdown content via Jina Reader/Direct fallback.",
      parameters: fetchParameters,
      async execute(_toolCallId, params, signal, onUpdate) {
        return executeFetch(params, signal, onUpdate);
      },
    });
  } catch {
    // web_fetch may already be registered
  }

  // Register /cliproxy-config to view or update remote/local configuration
  pi.registerCommand("cliproxy-config", {
    description: "View or set CLIProxyAPI search endpoint and API key (supports remote NAS/VPS)",
    async handler(args: string, ctx: any) {
      const parts = (args || "").trim().split(/\s+/).filter(Boolean);

      if (parts.length > 0) {
        const newEndpoint = parts[0];
        const newKey = parts[1] || "";
        const savedPath = saveCLIProxyConfigFile({ endpoint: newEndpoint, apiKey: newKey });
        config = resolveCLIProxyConfig();

        ctx.ui.notify(
          `Configuration saved to ${savedPath}\nEndpoint: ${config.endpoint}\nKey: ${maskApiKey(config.apiKey)}`,
          "info"
        );
        return;
      }

      config = resolveCLIProxyConfig();
      const info = [
        `CLIProxy Search Configuration:`,
        `• Endpoint: ${config.endpoint}`,
        `• API Key: ${maskApiKey(config.apiKey)}`,
        `• Source: ${config.source} (${config.configFilePath || "environment/default"})`,
        ``,
        `To configure a remote instance:`,
        `/cliproxy-config <endpoint_url> [api_key]`,
        `Example: /cliproxy-config http://192.168.1.100:8317 my-secret-key`
      ].join("\n");

      ctx.ui.notify(info, "info");
    },
  });

  // Register a status command /cliproxy-status
  pi.registerCommand("cliproxy-status", {
    description: "Check connectivity, mounted accounts, and search engines on CLIProxyAPI",
    async handler(_args: string, ctx: any) {
      config = resolveCLIProxyConfig();
      ctx.ui.notify(`Probing CLIProxyAPI at ${config.endpoint} (source: ${config.source})...`, "info");
      
      const caps = await probeEngineCapabilities(config, true);

      let codexStatus = caps.hasCodex ? "MOUNTED" : "NOT FOUND";
      let agyStatus = caps.hasAntigravity ? "MOUNTED" : "NOT FOUND";

      if (caps.hasCodex) {
        try {
          const res = await searchCodex("ping", config, { limit: 1 });
          if (res.results.length > 0 || res.elapsedMs > 0) {
            codexStatus = "READY (OK, ~2s)";
          }
        } catch (e: any) {
          codexStatus = `ERROR: ${e?.message || "unreachable"}`;
        }
      }

      if (caps.hasAntigravity) {
        try {
          const res = await searchAntigravity("ping", config, { limit: 1 });
          if (res.results.length > 0 || res.elapsedMs > 0) {
            agyStatus = "READY (OK)";
          }
        } catch (e: any) {
          agyStatus = `ERROR: ${e?.message || "unreachable"}`;
        }
      }

      const msg = [
        `CLIProxyAPI Gateway: ${config.endpoint}`,
        `• Config Source: ${config.source}`,
        `• Detected Models: ${caps.models.length} active`,
        `• Codex Alpha Search: ${codexStatus}`,
        `• Antigravity Grounding: ${agyStatus}`,
        caps.hasCodex && caps.hasAntigravity
          ? "Strategy: Dual-engine active (Codex fast-route with Antigravity fallback)"
          : caps.hasCodex
          ? "Strategy: Single-engine (Codex only)"
          : caps.hasAntigravity
          ? "Strategy: Single-engine (Antigravity only)"
          : "Strategy: No active search credentials found in CLIProxyAPI"
      ].join("\n");

      ctx.ui.notify(msg, "info");
    },
  });
}
