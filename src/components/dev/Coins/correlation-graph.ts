import type { CoinFinderResult } from "@/lib/devBacktest/coins/types";

export interface CorrelationGraphNode {
  averageScore: number | null;
  color: string;
  id: string;
  symbol: string;
  val: number;
}

export interface CorrelationGraphLink {
  score: number;
  source: string | CorrelationGraphNode;
  target: string | CorrelationGraphNode;
}

/** Builds one undirected link per available pairwise correlation score. */
export function buildCorrelationGraphData(
  results: CoinFinderResult[],
  colors: string[],
) {
  const nodes: CorrelationGraphNode[] = results.map((result, index) => ({
    averageScore: result.correlationScore,
    color: colors[index % colors.length],
    id: result.symbol,
    symbol: result.symbol,
    val: 7,
  }));
  const knownSymbols = new Set(nodes.map((node) => node.symbol));
  const seenPairs = new Set<string>();
  const links: CorrelationGraphLink[] = [];

  for (const result of results) {
    for (const [otherSymbol, rawScore] of Object.entries(
      result.correlations ?? {},
    )) {
      if (!knownSymbols.has(otherSymbol) || !Number.isFinite(rawScore)) continue;
      const pair = [result.symbol, otherSymbol].sort();
      const key = pair.join(":");
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      links.push({
        score: Math.max(0, Math.min(1, rawScore)),
        source: pair[0],
        target: pair[1],
      });
    }
  }

  return { links, nodes };
}
