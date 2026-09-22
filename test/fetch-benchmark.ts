import { fetchWebPage } from "../extensions/fetch.ts";

const testSites = [
  {
    category: "1. Modern SPA Frontend Tech Blog (React 19 Official Release)",
    url: "https://react.dev/blog/2024/12/05/react-19",
  },
  {
    category: "2. Authoritative RFC Specification (IETF RFC 9110 HTTP Semantics)",
    url: "https://datatracker.ietf.org/doc/html/rfc9110",
  },
  {
    category: "3. GitHub Open Source Release Notes (Bun Releases)",
    url: "https://github.com/oven-sh/bun/releases",
  },
  {
    category: "4. Cloudflare Deep Architecture Blog (Production Engineering Deep Dive)",
    url: "https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-powers-cloudflare-and-inspires-our-open-source-work/",
  },
  {
    category: "5. Official Language Documentation (Golang Getting Started Tutorial)",
    url: "https://go.dev/doc/tutorial/getting-started",
  },
  {
    category: "6. International Tech Blog (Node.js ESM Module Usage)",
    url: "https://www.ruanyifeng.com/blog/2020/08/how-nodejs-use-es6-module.html",
  },
];

async function main() {
  console.log("================================================================");
  console.log("     Jina Reader (pi-cliproxy-search) Multi-Site Fetch Benchmark");
  console.log("================================================================\n");

  for (const item of testSites) {
    console.log(`----------------------------------------------------------------`);
    console.log(`[Category]    ${item.category}`);
    console.log(`[Target URL]  ${item.url}`);
    
    const start = Date.now();
    try {
      const res = await fetchWebPage(item.url, { maxChars: 500 });
      const duration = Date.now() - start;
      console.log(`[Status]      ✅ SUCCESS (Engine: ${res.engine.toUpperCase()}, Latency: ${duration}ms)`);
      console.log(`[Title]       ${res.title || "(no title detected)"}`);
      console.log(`[Content]     Total ${res.totalChars} chars (Preview truncated to 500 chars)`);
      console.log(`[Extract Preview]:`);
      console.log(res.content.slice(0, 260).replace(/\n\s*\n/g, "\n").trim());
      console.log(``);
    } catch (err: any) {
      console.log(`[Status]      ❌ FAILED (Latency: ${Date.now() - start}ms): ${err?.message || err}\n`);
    }
  }

  console.log("================================================================");
  console.log("                     Benchmark Completed");
  console.log("================================================================");
}

main();
