import type { McliApp } from "../types";

export interface SearchMatch {
  path: string;
  argv: string[];
  summary: string;
  score: number;
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text.toLowerCase()} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

function similarity(query: string, text: string): number {
  const qGrams = trigrams(query);
  const tGrams = trigrams(text);
  if (qGrams.size === 0) return 0;

  let intersection = 0;
  for (const g of qGrams) {
    if (tGrams.has(g)) intersection++;
  }
  return intersection / qGrams.size;
}

export function search(app: McliApp, query: string, limit = 10): SearchMatch[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const matches: SearchMatch[] = [];

  for (const node of app.allCommands()) {
    const text = [node.path, node.summary, node.description ?? ""].join(" ");
    const score = similarity(q, text);
    if (score >= 0.15) {
      matches.push({
        path: node.path,
        argv: node.argv,
        summary: node.summary,
        score,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}
