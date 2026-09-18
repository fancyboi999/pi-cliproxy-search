export interface SearchItem {
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
}

export interface SearchResponse {
  engine: "codex" | "antigravity";
  query: string;
  results: SearchItem[];
  markdownSummary?: string;
  rawMarkdownSnippet?: string;
  elapsedMs: number;
}

export interface SearchOptions {
  engine?: "auto" | "codex" | "antigravity";
  limit?: number;
  deep?: boolean;
}
