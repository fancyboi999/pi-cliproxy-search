import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveCLIProxyConfig } from "./config.js";
import { searchCodex } from "./codex.js";
import { searchAntigravity } from "./antigravity.js";
import type { SearchResponse, SearchOptions } from "./types.js";

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
  const config = resolveCLIProxyConfig();

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
        description: "Search engine routing: 'auto' (Codex ~2s fast crawl with Antigravity fallback), 'codex', or 'antigravity'.",
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
    onUpdate?: (update: { content: Array<{ type: "text"; text: string }>; details?: any }) => void
  ) {
    const query = params.query.trim();
    const engineMode = params.engine ?? "auto";
    const options: SearchOptions = {
      engine: engineMode,
      limit: params.limit ?? 5,
      deep: params.deep ?? false,
    };

    onUpdate?.({
      content: [{ type: "text", text: `Searching CLIProxyAPI (${engineMode})...` }],
    });

    let result: SearchResponse;

    if (engineMode === "codex") {
      result = await searchCodex(query, config, options, signal);
    } else if (engineMode === "antigravity") {
      result = await searchAntigravity(query, config, options, signal);
    } else {
      // "auto" mode: Codex first (blazing fast ~2s), fallback to Antigravity if unavailable
      try {
        result = await searchCodex(query, config, options, signal);
      } catch (err: any) {
        // Automatically fallback to Antigravity Google Grounding
        onUpdate?.({
          content: [{ type: "text", text: `Codex route unavailable (${err?.message}), falling back to Antigravity...` }],
        });
        result = await searchAntigravity(query, config, options, signal);
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

  // Register cliproxy_search
  pi.registerTool({
    name: "cliproxy_search",
    label: "CLIProxy Search",
    description:
      "High-speed, multi-engine web search powered by local CLIProxyAPI. Defaults to OpenAI Codex Alpha Search (~2s parallel crawling) with automatic fallback to Google Antigravity Grounding.",
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

  // Register a status command /cliproxy-status
  pi.registerCommand("cliproxy-status", {
    description: "Check connectivity and available search engines on local CLIProxyAPI",
    async callback(_args, ctx) {
      ctx.ui.notify(`Testing connection to ${config.endpoint}...`, "info");
      
      let codexOk = false;
      let agyOk = false;

      try {
        const codexRes = await searchCodex("ping", config, { limit: 1 });
        codexOk = codexRes.results.length > 0 || codexRes.elapsedMs > 0;
      } catch {}

      try {
        const agyRes = await searchAntigravity("ping", config, { limit: 1 });
        agyOk = agyRes.results.length > 0 || agyRes.elapsedMs > 0;
      } catch {}

      const msg = [
        `CLIProxyAPI: ${config.endpoint}`,
        `• Codex Alpha Search: ${codexOk ? "READY (OK)" : "OFFLINE / UNREACHABLE"}`,
        `• Antigravity Grounding: ${agyOk ? "READY (OK)" : "OFFLINE / UNREACHABLE"}`
      ].join("\n");

      ctx.ui.notify(msg, "info");
    },
  });
}
