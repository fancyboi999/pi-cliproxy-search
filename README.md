<div align="center">

# pi-cliproxy-search

<p align="center">
  <img src="assets/hero.png" alt="pi-cliproxy-search hero banner" width="680" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
</p>

**Blazing-fast, multi-engine web search extension for [Pi Coding Agent](https://pi.dev) powered by your local [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) gateway.**

[![npm version](https://img.shields.io/npm/v/pi-cliproxy-search.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/pi-cliproxy-search)
[![CI](https://img.shields.io/github/actions/workflow/status/fancyboi999/pi-cliproxy-search/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/fancyboi999/pi-cliproxy-search/actions)
[![Pi Package](https://img.shields.io/badge/pi--package-discoverable-blue.svg?style=flat-square)](https://pi.dev/packages)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![CLIProxyAPI Compatible](https://img.shields.io/badge/CLIProxyAPI-v7.3+-green.svg?style=flat-square)](https://github.com/router-for-me/CLIProxyAPI)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/fancyboi999/pi-cliproxy-search/pulls)

</div>

---

## ⚡ Overview

**`pi-cliproxy-search`** bridges your Pi Coding Agent directly to local AI gateway endpoints, providing instant, high-relevance web search and documentation retrieval without third-party API keys or rate-limits.

Instead of relying on fragile public search scrapers or slow secondary sub-LLM summarizers, this package routes queries straight through your authenticated **OpenAI Codex** and **Google Antigravity** accounts via [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI).

### 🚀 Benchmarks at a Glance

| Search Method | Average Latency | Data Volume | Context Quality | Token / Message Cost |
| :--- | :--- | :--- | :--- | :--- |
| **`pi-cliproxy-search` (Codex)** | **~1.9s** ⚡ | 70–80 KB Markdown | **Direct raw web crawl (unaltered)** | **0 Sub-LLM Tokens / 0 Messages** |
| `pi-web-search` (Sub-LLM) | **~6.8s** | 2–4 KB Summary | Secondary model summary (lossy) | Heavy input & reasoning token burn |
| Public Scraping (`pi-web-access`) | **~3.5s–8s+** | 1–3 KB Snippets | Often blocked by anti-bot/Cloudflare | Free public, zero SLA |

---

## 🌟 Key Features

* **⚡ ~2s Pure Raw Search (Codex Alpha Search)**: Uses OpenAI's backend cluster crawler (`/v1/alpha/search`) to retrieve 30–40 authoritative sources and clean Markdown extracts in under 2 seconds.
* **🛡️ Dual-Engine Automatic Fallback (Google Antigravity)**: Seamlessly falls back to Antigravity Google Search Grounding with verified source citations if Codex credentials are busy or rate-limited.
* **🧠 100% Model-Agnostic**: Works with **any active Pi conversation model** — whether you are coding with Claude 3.7 Sonnet, DeepSeek V3, Qwen 2.5, or local Ollama models.
* **🔌 Zero-Configuration Auto-Discovery**: Automatically parses your local `~/.cli-proxy-api/config.yaml` to resolve loopback host, port (`8317`), and authentication tokens.
* **🛡️ Context Window & Token Protection**: Extracts clean structured titles, URLs, and concise snippets by default (~3 KB). Full Markdown text is strictly opt-in via `deep: true`.
* **🩺 Built-in Health Command**: Run `/cliproxy-status` right inside Pi to verify live gateway and engine connectivity.

---

## 📐 Architecture & Routing Logic

```text
┌─────────────────────────────────────────────────────────────┐
│                    Pi Coding Agent Session                  │
│       (Claude 3.7 / DeepSeek V3 / Qwen / Any Model)         │
└──────────────────────────────┬──────────────────────────────┘
                               │ Calls cliproxy_search / web_search
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  pi-cliproxy-search Router                  │
│               (Zero-config local discovery)                 │
└──────────────┬───────────────────────────────┬──────────────┘
               │ Primary (~1.9s)               │ Fallback (on 429/error)
               ▼                               ▼
  ┌─────────────────────────┐     ┌─────────────────────────┐
  │   Codex Alpha Search    │     │  Google Antigravity     │
  │    (/v1/alpha/search)   │     │    (/v1/messages)       │
  │   38 Sources Markdown   │     │  Google Search Ground   │
  └─────────────────────────┘     └─────────────────────────┘
               │                               │
               └───────────────┬───────────────┘
                               ▼
               Clean Structured Markdown Output
               (with optional deep page extracts)
```

---

## 📦 Installation

### Option 1: Direct Git Install (Recommended)

Run directly from your terminal:

```bash
pi install git:github.com/fancyboi999/pi-cliproxy-search
```

### Option 2: Project-Local Installation

To install only for the current project:

```bash
pi install --local git:github.com/fancyboi999/pi-cliproxy-search
```

### Option 3: Local Development Mode

Clone the repository and install from the directory:

```bash
git clone https://github.com/fancyboi999/pi-cliproxy-search.git
cd pi-cliproxy-search
pi install .
```

To test without installation:
```bash
pi -e ./pi-cliproxy-search/extensions/index.ts
```

---

## ⚙️ Configuration & Remote Gateways

`pi-cliproxy-search` supports **both local and remote CLIProxyAPI instances** (e.g. deployed on a remote VPS, homelab NAS, or Tailscale private network) through a 4-tier cascading resolution strategy:

```text
1. Dedicated Config File (~/.pi/agent/cliproxy-search.json)  <-- Highest precedence
2. Environment Variables (CLIPROXY_ENDPOINT / CLIPROXY_API_KEY)
3. Local Auto-Detection (~/.cli-proxy-api/config.yaml)        <-- Zero-config for local users
4. Default Loopback (http://127.0.0.1:8317)                  <-- Safe fallback
```

### 1. Zero-Config for Local Users
If you run CLIProxyAPI locally on the same machine, **no configuration is required**.
The extension automatically inspects `~/.cli-proxy-api/config.yaml` to extract the loopback port and local API key.

### 2. For Remote Instances (VPS / NAS / Tailnet)

#### Method A: Interactive Command inside Pi
Run the built-in command directly in your Pi chat:
```text
/cliproxy-config http://192.168.1.100:8317 your-secret-key
```
This automatically writes to `~/.pi/agent/cliproxy-search.json` with secure `0600` permissions and hot-reloads instantly.

To view current active configuration and source:
```text
/cliproxy-config
```

#### Method B: JSON Config File
Create or edit `~/.pi/agent/cliproxy-search.json`:
```json
{
  "endpoint": "https://my-proxy.tailnet-xyz.ts.net",
  "apiKey": "your-secret-token"
}
```

#### Method C: Environment Variables (CI / Docker)
```bash
export CLIPROXY_ENDPOINT="http://remote-server:8317"
export CLIPROXY_API_KEY="your-secret-token"
```

---

## 🛠️ Tool Usage & Parameters

The extension exposes two complementary tools for your coding agent:
1. **`cliproxy_search`** (or `web_search`): High-speed query search with multi-engine fallback.
2. **`cliproxy_fetch`** (or `web_fetch`): High-fidelity web page reader converting raw HTML/SPAs directly into clean Markdown via Jina Reader.

---

### 1. `cliproxy_search` (Search Engine)

```json
{
  "query": "Go 1.27 release notes and runtime changes",
  "engine": "auto",
  "limit": 5,
  "deep": false
}
```

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `query` | `string` | **required** | The search keyword or phrase. |
| `engine` | `enum` | `"auto"` | `"auto"` (Codex first, Antigravity fallback), `"codex"`, or `"antigravity"`. |
| `deep` | `boolean` | `false` | When `true`, includes raw Markdown extracts from crawled pages (useful for in-depth code/API docs). |
| `limit` | `integer` | `5` | Maximum number of source citations to return (1–10). |

---

### 2. `cliproxy_fetch` (Clean Page Reader)

When you need to inspect an exact article, GitHub documentation, or blog post from a specific URL:

```json
{
  "url": "https://go.dev/doc/devel/release",
  "maxChars": 15000
}
```

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `url` | `string` | **required** | The target webpage URL to fetch and convert to Markdown. |
| `maxChars` | `integer` | `15000` | Safety context cap (0 for unlimited). Truncates long pages to protect LLM context windows. |

**Why `cliproxy_fetch` over `curl`?**
* **Clean Markdown Extraction**: Powered by Jina Reader (`r.jina.ai`) — eliminates `<script>`, `<style>`, navigation bars, cookie banners, and ads.
* **Bypasses Cloudflare & SPAs**: Successfully fetches dynamic Single Page Applications (React/Vue/Next.js) that return empty divs under `curl`.
* **Zero LLM Hallucination / Bias**: Direct algorithmic DOM-to-Markdown conversion — not a secondary LLM summary. Function signatures, type definitions, and code blocks remain 100% exact.
* **Resilient Direct Fallback**: Automatically falls back to native HTTP fetch + text stripper if external reader services are unavailable.

---

## 🩺 Diagnostics Command

In any Pi chat session, type:

```text
/cliproxy-status
```

The extension performs live probes against your local CLIProxyAPI instance and reports:
* Gateway loopback reachability
* **Codex Alpha Search** status (`READY` / `OFFLINE`)
* **Google Antigravity Grounding** status (`READY` / `OFFLINE`)

---

## 🤝 Contributing

Contributions, bug reports, and pull requests are warmly welcome!
* To report a bug or suggest a feature: [Open an Issue](https://github.com/fancyboi999/pi-cliproxy-search/issues)
* Pull requests should pass test suites: `bun test` or `node --test`

---

## 📄 License

[MIT License](LICENSE) © 2026 [fancyboi999](https://github.com/fancyboi999)
