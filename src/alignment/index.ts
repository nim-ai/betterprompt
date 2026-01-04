/**
 * Alignment module.
 * Aligns semantic units between two texts.
 */

import type {
  SemanticUnit,
  AlignedPair,
  AlignmentResult,
  AlignmentOptions,
  EmbeddingProvider,
} from "../types/index.js";
import { cosineSimilarity } from "../utils/similarity.js";
import { getDefaultProvider } from "../embeddings/index.js";

/**
 * Default alignment options.
 */
const DEFAULT_OPTIONS: Required<AlignmentOptions> = {
  strategy: "hybrid",
  matchThreshold: 0.75,
  usePositionHints: true,
};

/**
 * Align two sets of semantic units using the specified strategy.
 */
export async function align(
  source: SemanticUnit[],
  target: SemanticUnit[],
  options: AlignmentOptions = {},
  provider?: EmbeddingProvider
): Promise<AlignmentResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Handle edge cases
  if (source.length === 0 && target.length === 0) {
    return { pairs: [], unmatchedSource: [], unmatchedTarget: [] };
  }

  if (source.length === 0) {
    return {
      pairs: target.map((t) => ({
        source: null,
        target: t,
        similarity: 0,
        type: "insertion" as const,
      })),
      unmatchedSource: [],
      unmatchedTarget: [],
    };
  }

  if (target.length === 0) {
    return {
      pairs: source.map((s) => ({
        source: s,
        target: null,
        similarity: 0,
        type: "deletion" as const,
      })),
      unmatchedSource: [],
      unmatchedTarget: [],
    };
  }

  // Get embeddings for all units
  const embeddingProvider = provider ?? getDefaultProvider();
  const allTexts = [
    ...source.map((u) => u.content),
    ...target.map((u) => u.content),
  ];
  const allEmbeddings = await embeddingProvider.embed(allTexts);

  const sourceEmbeddings = allEmbeddings.slice(0, source.length);
  const targetEmbeddings = allEmbeddings.slice(source.length);

  // Compute similarity matrix
  const similarityMatrix: number[][] = [];
  for (let i = 0; i < source.length; i++) {
    similarityMatrix[i] = [];
    for (let j = 0; j < target.length; j++) {
      const srcEmb = sourceEmbeddings[i];
      const tgtEmb = targetEmbeddings[j];
      if (srcEmb && tgtEmb) {
        similarityMatrix[i]![j] = cosineSimilarity(srcEmb, tgtEmb);
      } else {
        similarityMatrix[i]![j] = 0;
      }
    }
  }

  // Choose alignment strategy
  switch (opts.strategy) {
    case "sequential":
      return sequentialAlign(source, target, similarityMatrix, opts);
    case "semantic":
      return semanticAlign(source, target, similarityMatrix, opts);
    case "hybrid":
    default:
      return hybridAlign(source, target, similarityMatrix, opts);
  }
}

/**
 * Sequential alignment using dynamic programming.
 * Preserves order, similar to diff algorithms.
 */
function sequentialAlign(
  source: SemanticUnit[],
  target: SemanticUnit[],
  similarityMatrix: number[][],
  opts: Required<AlignmentOptions>
): AlignmentResult {
  const m = source.length;
  const n = target.length;

  // DP table for optimal alignment score
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Backtracking table
  const backtrack: string[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(""));

  // Fill DP table
  for (let i = 1; i <= m; i++) {
    backtrack[i]![0] = "delete";
  }
  for (let j = 1; j <= n; j++) {
    backtrack[0]![j] = "insert";
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sim = similarityMatrix[i - 1]![j - 1]!;
      const matchScore =
        (dp[i - 1]?.[j - 1] ?? 0) + (sim >= opts.matchThreshold ? sim : -0.5);
      const deleteScore = (dp[i - 1]?.[j] ?? 0) - 0.1;
      const insertScore = (dp[i]?.[j - 1] ?? 0) - 0.1;

      if (matchScore >= deleteScore && matchScore >= insertScore) {
        dp[i]![j] = matchScore;
        backtrack[i]![j] = "match";
      } else if (deleteScore >= insertScore) {
        dp[i]![j] = deleteScore;
        backtrack[i]![j] = "delete";
      } else {
        dp[i]![j] = insertScore;
        backtrack[i]![j] = "insert";
      }
    }
  }

  // Backtrack to find alignment
  const pairs: AlignedPair[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    const action = backtrack[i]?.[j];
    if (action === "match" && i > 0 && j > 0) {
      const sim = similarityMatrix[i - 1]![j - 1]!;
      const srcUnit = source[i - 1]!;
      const tgtUnit = target[j - 1]!;
      pairs.unshift({
        source: srcUnit,
        target: tgtUnit,
        similarity: sim,
        type: sim >= opts.matchThreshold ? "match" : "modification",
      });
      i--;
      j--;
    } else if (action === "delete" && i > 0) {
      pairs.unshift({
        source: source[i - 1]!,
        target: null,
        similarity: 0,
        type: "deletion",
      });
      i--;
    } else if (j > 0) {
      pairs.unshift({
        source: null,
        target: target[j - 1]!,
        similarity: 0,
        type: "insertion",
      });
      j--;
    } else {
      break;
    }
  }

  return {
    pairs,
    unmatchedSource: [],
    unmatchedTarget: [],
  };
}

/**
 * Semantic alignment using greedy matching.
 * Matches by semantic similarity, ignoring order.
 */
function semanticAlign(
  source: SemanticUnit[],
  target: SemanticUnit[],
  similarityMatrix: number[][],
  opts: Required<AlignmentOptions>
): AlignmentResult {
  const pairs: AlignedPair[] = [];
  const matchedSource = new Set<number>();
  const matchedTarget = new Set<number>();

  // Find all candidate matches above threshold
  const candidates: Array<{ i: number; j: number; sim: number }> = [];
  for (let i = 0; i < source.length; i++) {
    for (let j = 0; j < target.length; j++) {
      const sim = similarityMatrix[i]![j]!;
      if (sim >= opts.matchThreshold) {
        candidates.push({ i, j, sim });
      }
    }
  }

  // Sort by similarity (descending)
  candidates.sort((a, b) => b.sim - a.sim);

  // Greedy matching
  for (const { i, j, sim } of candidates) {
    if (!matchedSource.has(i) && !matchedTarget.has(j)) {
      pairs.push({
        source: source[i]!,
        target: target[j]!,
        similarity: sim,
        type: sim >= 0.99 ? "match" : "modification",
      });
      matchedSource.add(i);
      matchedTarget.add(j);
    }
  }

  // Add unmatched as deletions/insertions
  for (let i = 0; i < source.length; i++) {
    if (!matchedSource.has(i)) {
      pairs.push({
        source: source[i]!,
        target: null,
        similarity: 0,
        type: "deletion",
      });
    }
  }

  for (let j = 0; j < target.length; j++) {
    if (!matchedTarget.has(j)) {
      pairs.push({
        source: null,
        target: target[j]!,
        similarity: 0,
        type: "insertion",
      });
    }
  }

  // Sort by target position for consistent output
  pairs.sort((a, b) => {
    const aPos = a.target?.index ?? a.source?.index ?? 0;
    const bPos = b.target?.index ?? b.source?.index ?? 0;
    return aPos - bPos;
  });

  return {
    pairs,
    unmatchedSource: [],
    unmatchedTarget: [],
  };
}

/**
 * Hybrid alignment combining sequential and semantic strategies.
 * Uses sequential as primary, semantic for moved content.
 */
function hybridAlign(
  source: SemanticUnit[],
  target: SemanticUnit[],
  similarityMatrix: number[][],
  opts: Required<AlignmentOptions>
): AlignmentResult {
  // Start with sequential alignment
  const seqResult = sequentialAlign(source, target, similarityMatrix, opts);

  // Check for potential moves (high-similarity deletions/insertions)
  const deletions = seqResult.pairs.filter((p) => p.type === "deletion");
  const insertions = seqResult.pairs.filter((p) => p.type === "insertion");

  // Try to match deletions with insertions
  for (const del of deletions) {
    if (!del.source) continue;

    for (const ins of insertions) {
      if (!ins.target) continue;

      const srcIdx = source.indexOf(del.source);
      const tgtIdx = target.indexOf(ins.target);

      if (srcIdx >= 0 && tgtIdx >= 0) {
        const sim = similarityMatrix[srcIdx]![tgtIdx]!;
        if (sim >= opts.matchThreshold) {
          // Convert to move (modification)
          del.target = ins.target;
          del.similarity = sim;
          del.type = "modification";

          // Mark insertion as handled
          ins.source = del.source;
          ins.type = "modification";
        }
      }
    }
  }

  // Remove duplicate pairs after move detection
  const seen = new Set<string>();
  const dedupedPairs = seqResult.pairs.filter((p) => {
    const key = `${p.source?.hash ?? "null"}-${p.target?.hash ?? "null"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    pairs: dedupedPairs,
    unmatchedSource: [],
    unmatchedTarget: [],
  };
}

export type { AlignedPair, AlignmentResult, AlignmentOptions };
