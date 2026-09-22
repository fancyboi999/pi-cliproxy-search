import { fetchWebPage } from "../extensions/fetch.ts";

const testSites = [
  {
    category: "1. 现代 SPA 前端技术博客 (React 19 官方发布)",
    url: "https://react.dev/blog/2024/12/05/react-19",
  },
  {
    category: "2. 权威网络协议 RFC 规范 (IETF RFC 9110 HTTP 语义)",
    url: "https://datatracker.ietf.org/doc/html/rfc9110",
  },
  {
    category: "3. GitHub 开源项目发布日志 (Bun Releases)",
    url: "https://github.com/oven-sh/bun/releases",
  },
  {
    category: "4. Cloudflare 深度架构博客 (真实存在的技术长文)",
    url: "https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-powers-cloudflare-and-inspires-our-open-source-work/",
  },
  {
    category: "5. Golang 官方教程文档 (Getting Started 代码教程)",
    url: "https://go.dev/doc/tutorial/getting-started",
  },
  {
    category: "6. 著名中文独立技术博客 (阮一峰网络日志 - ESM 模块说明)",
    url: "https://www.ruanyifeng.com/blog/2020/08/how-nodejs-use-es6-module.html",
  },
];

async function main() {
  console.log("================================================================");
  console.log("       Jina Reader (pi-cliproxy-search) 多类型网站实测");
  console.log("================================================================\n");

  for (const item of testSites) {
    console.log(`----------------------------------------------------------------`);
    console.log(`[测试类型] ${item.category}`);
    console.log(`[目标 URL] ${item.url}`);
    
    const start = Date.now();
    try {
      const res = await fetchWebPage(item.url, { maxChars: 500 });
      const duration = Date.now() - start;
      console.log(`[抓取状态] ✅ 成功 (引擎: ${res.engine.toUpperCase()}, 耗时: ${duration}ms)`);
      console.log(`[页面标题] ${res.title || "（未检测到独立标题）"}`);
      console.log(`[内容规模] 原文总长 ${res.totalChars} 字符 (安全截断预览前 500 字符)`);
      console.log(`[提取预览]:`);
      console.log(res.content.slice(0, 260).replace(/\n\s*\n/g, "\n").trim());
      console.log(``);
    } catch (err: any) {
      console.log(`[抓取状态] ❌ 失败 (耗时: ${Date.now() - start}ms): ${err?.message || err}\n`);
    }
  }

  console.log("================================================================");
  console.log("                      实测总结报告");
  console.log("================================================================");
}

main();
