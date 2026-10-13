export interface FetchResult {
  url: string;
  title?: string;
  content: string;
  engine: "jina" | "direct" | "antigravity";
  elapsedMs: number;
  truncated: boolean;
  totalChars: number;
}

export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

export interface FetchOptions {
  /** Total network budget across the reader and direct fallback, including response bodies. */
  timeoutMs?: number;
  maxChars?: number;
  targetSelector?: string;
  removeSelector?: string;
}

/**
 * Strips HTML tags and extraneous whitespace for direct fallback.
 */
function cleanRawHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

/**
 * Post-processes Markdown to strip navigation residues and reduce whitespace.
 */
function polishMarkdown(raw: string): string {
  return raw
    // Remove "Skip to content" links
    .replace(/\[Skip to (?:main )?content\]\([^)]+\)/gi, "")
    // Remove standalone empty image references or common banner noise
    .replace(/\[!\[Image \d+[^\]]*\]\([^)]+\)\]\([^)]+\)/g, "")
    // Collapse 3 or more newlines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Keep the timer and caller cancellation active until the response body is consumed. */
async function fetchText(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
    timeoutMs
  );
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } catch (err) {
    signal?.throwIfAborted();
    controller.signal.throwIfAborted();
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * High-fidelity web content fetcher:
 * 1. Primary: Jina Reader (https://r.jina.ai/<url>) for clean, anti-bot-resistant Markdown.
 * 2. Fallback: Direct fetch with lightweight DOM/text extraction.
 */
export async function fetchWebPage(
  rawUrl: string,
  options?: FetchOptions,
  signal?: AbortSignal
): Promise<FetchResult> {
  signal?.throwIfAborted();
  const startTime = Date.now();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("timeoutMs must be an integer between 1 and 120000");
  }
  const maxChars = options?.maxChars ?? 15000;

  // Normalize URL
  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  // Build remove selector
  const defaultRemove = "nav, header, footer, .navigation, .nav, .sidebar, .menu, .navbar, .header-wrapper, .AppHeader";
  const finalRemove = options?.removeSelector
    ? `${defaultRemove}, ${options.removeSelector}`
    : defaultRemove;

  // Reserve 40% of a short budget for fallback. Default limits remain 12s + 8s.
  let jinaError: unknown;
  try {
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;

    const headers: Record<string, string> = {
      "Accept": "text/plain",
      "X-Return-Format": "markdown",
      "X-Remove-Selector": finalRemove,
    };
    if (options?.targetSelector) {
      headers["X-Target-Selector"] = options.targetSelector;
    }

    const text = await fetchText(
      jinaUrl, headers, Math.min(12_000, Math.max(1, Math.floor(timeoutMs * 0.6))), signal
    );

    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    // Extract markdown body (strip leading Jina header lines if present)
    let body = text;
    const mdContentIndex = text.indexOf("Markdown Content:");
    if (mdContentIndex !== -1) {
      body = text.slice(mdContentIndex + "Markdown Content:".length).trim();
    }

    body = polishMarkdown(body);
    const totalChars = body.length;
    let finalContent = body;
    let truncated = false;

    if (maxChars > 0 && totalChars > maxChars) {
      finalContent = body.slice(0, maxChars) + `\n\n*(Content truncated: showing first ${maxChars} of ${totalChars} characters. Specify maxChars to view more)*`;
      truncated = true;
    }

    return {
      url: targetUrl,
      title,
      content: finalContent,
      engine: "jina",
      elapsedMs: Date.now() - startTime,
      truncated,
      totalChars,
    };
  } catch (err) {
    // A caller cancellation is terminal, not a reason to start another request.
    signal?.throwIfAborted();
    jinaError = err;
  }

  // 2. Fallback uses only the remaining total budget (at most 8 seconds).
  try {
    const remainingMs = timeoutMs - (Date.now() - startTime);
    if (remainingMs <= 0) {
      throw new Error(`Total fetch budget timed out after ${timeoutMs}ms`);
    }
    const rawHtml = await fetchText(targetUrl, {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    }, Math.min(8_000, remainingMs), signal);
    const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    const cleaned = polishMarkdown(cleanRawHtml(rawHtml));
    const totalChars = cleaned.length;
    let finalContent = cleaned;
    let truncated = false;

    if (maxChars > 0 && totalChars > maxChars) {
      finalContent = cleaned.slice(0, maxChars) + `\n\n*(Content truncated: showing first ${maxChars} of ${totalChars} characters)*`;
      truncated = true;
    }

    return {
      url: targetUrl,
      title,
      content: finalContent,
      engine: "direct",
      elapsedMs: Date.now() - startTime,
      truncated,
      totalChars,
    };
  } catch (err) {
    signal?.throwIfAborted();
    const message = (error: unknown) => error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch web page at ${targetUrl}. Jina: ${message(jinaError)}; Direct: ${message(err)}`);
  }
}
