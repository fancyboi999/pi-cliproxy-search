# pi-cliproxy-search

> **High-speed, multi-engine web search for [Pi Coding Agent](https://pi.dev) powered by your local [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) gateway.**

## Why pi-cliproxy-search?

Most web search tools for coding agents fall into two extremes:
1. **Third-party public engines (Exa, DuckDuckGo, Tavily)**: Suffer from frequent rate-limits, anti-bot Cloudflare challenges, or require separate paid API keys.
2. **Sub-LLM search wrappers (e.g. `pi-web-search`)**: Delegate the search to a secondary LLM to generate summaries, which costs 6–9 seconds of wait time and burns heavy input/reasoning tokens.

**`pi-cliproxy-search` bridges Pi directly to your local CLIProxyAPI accounts:**
- **Codex Alpha Search (`/v1/alpha/search`)**: Blazing fast (**~2s**), raw parallel crawling directly from OpenAI's backend cluster. Returns unadulterated Markdown extracts without secondary LLM interpretation.
- **Google Antigravity Grounding**: Automatic seamless fallback with official Google Grounding citations if Codex credentials are unavailable or rate-limited.
- **Model-Agnostic**: Works seamlessly regardless of your active Pi conversation model (Claude 3.7, DeepSeek V3, Qwen, etc.).
- **Zero Config**: Automatically discovers your local CLIProxyAPI instance and API key from `~/.cli-proxy-api/config.yaml`.

---

## Features

| Feature | Description |
| :--- | :--- |
| ⚡ **~2s Blazing Fast** | Directly uses OpenAI Codex Alpha Search parallel crawler pipeline. |
| 🛡️ **Dual-Engine Resilience** | Auto-fallback to Antigravity (Google Search Grounding) on any transient errors. |
| 💰 **Zero Extra API Cost** | Reuses your existing Codex / Antigravity accounts already signed into CLIProxyAPI. |
| 🧼 **Token Safe** | Structured citation extracts by default (~3–5KB). Optional `deep: true` for full Markdown. |
| 🔍 **Drop-in Replacement** | Registers both `cliproxy_search` and optionally `web_search`. |
| 📊 **Status Diagnostics** | Includes a built-in `/cliproxy-status` command to verify backend health. |

---

## Installation

### From Git (Recommended)

```bash
pi install git:github.com/fancyboi999/pi-cliproxy-search
```

### Local / Development Mode

Clone and install directly from your local filesystem:

```bash
git clone https://github.com/fancyboi999/pi-cliproxy-search.git
cd pi-cliproxy-search
pi install .
```

To test without permanently installing:
```bash
pi -e ./pi-cliproxy-search/extensions/index.ts
```

---

## Configuration

**Zero configuration required by default!**

`pi-cliproxy-search` automatically inspects:
1. `~/.cli-proxy-api/config.yaml` to detect your local `host`, `port` (default `8317`), and `api-keys`.
2. Environment variables override (optional):
   ```bash
   export CLIPROXY_SEARCH_ENDPOINT="http://127.0.0.1:8317"
   export CLIPROXY_API_KEY="your-cli-proxy-api-key"
   ```

---

## Tool Parameters

The agent can call `cliproxy_search` (or `web_search`):

```json
{
  "query": "Kubernetes 1.32 release notes changes",
  "engine": "auto",
  "limit": 5,
  "deep": false
}
```

* **`query`** *(string, required)*: The search query.
* **`engine`** *(enum: `"auto"` \| `"codex"` \| `"antigravity"`, default: `"auto"`)*:
  - `"auto"`: Fast Codex crawl first (~2s); falls back to Google Antigravity if unavailable.
  - `"codex"`: Force OpenAI Codex Alpha Search.
  - `"antigravity"`: Force Google Antigravity Grounding with authoritative citation URLs.
* **`deep`** *(boolean, default: `false`)*:
  - `false`: Returns high-relevance title, URL, domain, and snippet (token-efficient).
  - `true`: Includes full crawled Markdown page extracts (useful when reading long documentation).
* **`limit`** *(integer, 1–10, default: `5`)*: Maximum number of search sources to return.

---

## Interactive Command

In any Pi chat session:
```text
/cliproxy-status
```
Checks connectivity to your local CLIProxyAPI instance and verifies the health of both Codex and Antigravity search pipelines.

---

## License

MIT © [fancyboi999](https://github.com/fancyboi999)
