export interface FetchResult {
  url: string;
  title?: string;
  content: string;
  engine: "jina" | "direct" | "antigravity";
  elapsedMs: number;
  truncated: boolean;
  totalChars: number;
}

export interface FetchOptions {
  maxChars?: number;
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
 * High-fidelity web content fetcher:
 * 1. Primary: Jina Reader (https://r.jina.ai/<url>) for clean, anti-bot-resistant Markdown.
 * 2. Fallback: Direct fetch with lightweight DOM/text extraction.
 */
export async function fetchWebPage(
  rawUrl: string,
  options?: FetchOptions,
  signal?: AbortSignal
): Promise<FetchResult> {
  const startTime = Date.now();
  const maxChars = options?.maxChars ?? 15000;

  // Normalize URL
  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  // 1. Primary route: Jina Reader (High-fidelity Markdown, bypasses Cloudflare/SPAs)
  try {
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    const res = await fetch(jinaUrl, {
      method: "GET",
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);

    if (res.ok) {
      const text = await res.text();
      const titleMatch = text.match(/^Title:\s*(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : undefined;

      // Extract markdown body (strip leading Jina header lines if present)
      let body = text;
      const mdContentIndex = text.indexOf("Markdown Content:");
      if (mdContentIndex !== -1) {
        body = text.slice(mdContentIndex + "Markdown Content:".length).trim();
      }

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
    }
  } catch {
    // Fall back to direct fetch
  }

  // 2. Fallback route: Direct HTTP fetch + Clean extraction
  try {
    const directRes = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      signal,
    });

    if (!directRes.ok) {
      throw new Error(`HTTP ${directRes.status} ${directRes.statusText}`);
    }

    const rawHtml = await directRes.text();
    const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    const cleaned = cleanRawHtml(rawHtml);
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
  } catch (err: any) {
    throw new Error(`Failed to fetch web page at ${targetUrl}: ${err?.message || err}`);
  }
}
