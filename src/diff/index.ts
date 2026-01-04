/**
 * Diff module.
 * Extracts edits between two texts.
 *
 * Uses word-level diff by default for finer granularity.
 */

import type {
  Edit,
  EditOperation,
  DiffResult,
  AlignedPair,
  SemanticUnit,
} from "../types/index.js";
import { segment } from "../segmentation/index.js";
import { align } from "../alignment/index.js";

// =============================================================================
// Word-level diff utilities
// =============================================================================

/**
 * Tokenize text into words, preserving whitespace as separate tokens.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inWord = false;

  for (const char of text) {
    const isWordChar = /\w/.test(char);

    if (isWordChar && !inWord) {
      if (current) tokens.push(current);
      current = char;
      inWord = true;
    } else if (!isWordChar && inWord) {
      if (current) tokens.push(current);
      current = char;
      inWord = false;
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);

  return tokens;
}

/**
 * Compute longest common subsequence for arrays.
 */
function lcs<T>(a: T[], b: T[]): T[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
      }
    }
  }

  const result: T[] = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]!);
      i--;
      j--;
    } else if ((dp[i - 1]?.[j] ?? 0) > (dp[i]?.[j - 1] ?? 0)) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * Word-level diff operation.
 */
export interface WordDiffOp {
  type: "keep" | "delete" | "insert" | "replace";
  content: string;
  oldContent?: string;
}

/**
 * Compute word-level diff between two texts.
 * Returns fine-grained operations showing exactly which words changed.
 */
export function wordDiff(original: string, modified: string): WordDiffOp[] {
  const tokensA = tokenize(original);
  const tokensB = tokenize(modified);
  const common = lcs(tokensA, tokensB);

  const ops: WordDiffOp[] = [];
  let ai = 0,
    bi = 0,
    ci = 0;

  while (ai < tokensA.length || bi < tokensB.length) {
    // Collect deletions (in original but not in common)
    const deletions: string[] = [];
    while (
      ai < tokensA.length &&
      (ci >= common.length || tokensA[ai] !== common[ci])
    ) {
      deletions.push(tokensA[ai]!);
      ai++;
    }

    // Collect insertions (in modified but not in common)
    const insertions: string[] = [];
    while (
      bi < tokensB.length &&
      (ci >= common.length || tokensB[bi] !== common[ci])
    ) {
      insertions.push(tokensB[bi]!);
      bi++;
    }

    // Emit operations
    if (deletions.length > 0 && insertions.length > 0) {
      // Both deleted and inserted at same position = replacement
      ops.push({
        type: "replace",
        content: insertions.join(""),
        oldContent: deletions.join(""),
      });
    } else if (deletions.length > 0) {
      ops.push({ type: "delete", content: deletions.join("") });
    } else if (insertions.length > 0) {
      ops.push({ type: "insert", content: insertions.join("") });
    }

    // Keep common element
    if (ci < common.length) {
      ops.push({ type: "keep", content: common[ci]! });
      ai++;
      bi++;
      ci++;
    }
  }

  return ops;
}

// =============================================================================
// Token-level diff (transformer tokenizer aligned)
// =============================================================================

/**
 * Simple tokenizer that mimics WordPiece behavior for diffing.
 * Splits on word boundaries and handles common subword patterns.
 */
function tokenizeSemantic(text: string): string[] {
  const tokens: string[] = [];

  // Split into words first, preserving whitespace
  const wordPattern =
    /(\s+)|([a-zA-Z]+(?:'[a-z]+)?)|([0-9]+(?:\.[0-9]+)?)|([^\s\w])/g;
  let match;

  while ((match = wordPattern.exec(text)) !== null) {
    const token = match[0];
    tokens.push(token);
  }

  return tokens;
}

/**
 * Token-level diff that aligns with transformer tokenization.
 * More granular than word-level but preserves semantic units.
 */
export function tokenDiff(original: string, modified: string): WordDiffOp[] {
  const tokensA = tokenizeSemantic(original);
  const tokensB = tokenizeSemantic(modified);
  const common = lcs(tokensA, tokensB);

  const ops: WordDiffOp[] = [];
  let ai = 0,
    bi = 0,
    ci = 0;

  while (ai < tokensA.length || bi < tokensB.length) {
    const deletions: string[] = [];
    while (
      ai < tokensA.length &&
      (ci >= common.length || tokensA[ai] !== common[ci])
    ) {
      deletions.push(tokensA[ai]!);
      ai++;
    }

    const insertions: string[] = [];
    while (
      bi < tokensB.length &&
      (ci >= common.length || tokensB[bi] !== common[ci])
    ) {
      insertions.push(tokensB[bi]!);
      bi++;
    }

    if (deletions.length > 0 && insertions.length > 0) {
      ops.push({
        type: "replace",
        content: insertions.join(""),
        oldContent: deletions.join(""),
      });
    } else if (deletions.length > 0) {
      ops.push({ type: "delete", content: deletions.join("") });
    } else if (insertions.length > 0) {
      ops.push({ type: "insert", content: insertions.join("") });
    }

    if (ci < common.length) {
      ops.push({ type: "keep", content: common[ci]! });
      ai++;
      bi++;
      ci++;
    }
  }

  return ops;
}

/**
 * Diff options for controlling granularity.
 */
export interface DiffOptions {
  /** Granularity level: 'token' | 'word' | 'sentence' */
  granularity?: "token" | "word" | "sentence";
}

/**
 * Unified diff function with configurable granularity.
 * Default is 'word' for best balance of precision and readability.
 */
export function simpleDiff(
  original: string,
  modified: string,
  options: DiffOptions = {}
): WordDiffOp[] {
  const { granularity = "word" } = options;

  switch (granularity) {
    case "token":
      return tokenDiff(original, modified);
    case "word":
      return wordDiff(original, modified);
    case "sentence": {
      // For sentence-level, treat each sentence as a token
      const sentencePattern = /[^.!?]+[.!?]+\s*/g;
      const sentencesA = original.match(sentencePattern) ?? [original];
      const sentencesB = modified.match(sentencePattern) ?? [modified];
      const commonSentences = lcs(sentencesA, sentencesB);

      const ops: WordDiffOp[] = [];
      let si = 0,
        ti = 0,
        ci = 0;

      while (si < sentencesA.length || ti < sentencesB.length) {
        const dels: string[] = [];
        while (
          si < sentencesA.length &&
          (ci >= commonSentences.length ||
            sentencesA[si] !== commonSentences[ci])
        ) {
          dels.push(sentencesA[si]!);
          si++;
        }
        const ins: string[] = [];
        while (
          ti < sentencesB.length &&
          (ci >= commonSentences.length ||
            sentencesB[ti] !== commonSentences[ci])
        ) {
          ins.push(sentencesB[ti]!);
          ti++;
        }

        if (dels.length > 0 && ins.length > 0) {
          ops.push({
            type: "replace",
            content: ins.join(""),
            oldContent: dels.join(""),
          });
        } else if (dels.length > 0) {
          ops.push({ type: "delete", content: dels.join("") });
        } else if (ins.length > 0) {
          ops.push({ type: "insert", content: ins.join("") });
        }

        if (ci < commonSentences.length) {
          ops.push({ type: "keep", content: commonSentences[ci]! });
          si++;
          ti++;
          ci++;
        }
      }
      return ops;
    }
    default:
      return wordDiff(original, modified);
  }
}

// =============================================================================
// Sentence-level diff (original implementation)
// =============================================================================

/**
 * Extract edits from aligned pairs.
 */
function pairsToEdits(pairs: AlignedPair[]): Edit[] {
  const edits: Edit[] = [];

  for (const pair of pairs) {
    switch (pair.type) {
      case "match":
        // Exact match - no edit needed, but we track it as KEEP
        if (pair.source) {
          edits.push({
            operation: "KEEP",
            anchor: pair.source.hash,
            oldContent: pair.source.content,
            confidence: 1.0,
          });
        }
        break;

      case "modification":
        // Content changed
        if (pair.source && pair.target) {
          edits.push({
            operation: "REPLACE",
            anchor: pair.source.hash,
            anchorContext: getContext(pair.source),
            oldContent: pair.source.content,
            newContent: pair.target.content,
            confidence: pair.similarity,
          });
        }
        break;

      case "insertion":
        // New content added
        if (pair.target) {
          edits.push({
            operation: "INSERT",
            anchor: "", // Will be filled with context
            newContent: pair.target.content,
            position: "after",
            confidence: 0.9, // Lower confidence for insertions
          });
        }
        break;

      case "deletion":
        // Content removed
        if (pair.source) {
          edits.push({
            operation: "DELETE",
            anchor: pair.source.hash,
            anchorContext: getContext(pair.source),
            oldContent: pair.source.content,
            confidence: 0.9,
          });
        }
        break;
    }
  }

  return edits;
}

/**
 * Get surrounding context for a semantic unit.
 */
function getContext(
  unit: SemanticUnit
): { before: string; after: string } | undefined {
  return {
    before: unit.prefix.trim(),
    after: unit.suffix.trim(),
  };
}

/**
 * Compute diff between two texts.
 */
export async function diff(
  original: string,
  modified: string
): Promise<DiffResult> {
  // Segment both texts
  const originalSeg = segment(original);
  const modifiedSeg = segment(modified);

  // Align segments
  const alignment = await align(originalSeg.units, modifiedSeg.units);

  // Extract edits
  const edits = pairsToEdits(alignment.pairs);

  // Compute statistics
  const stats = {
    kept: edits.filter((e) => e.operation === "KEEP").length,
    inserted: edits.filter((e) => e.operation === "INSERT").length,
    deleted: edits.filter((e) => e.operation === "DELETE").length,
    replaced: edits.filter((e) => e.operation === "REPLACE").length,
    moved: edits.filter((e) => e.operation === "MOVE").length,
  };

  return { edits, stats };
}

/**
 * Extract user edits as a patch that can be applied to a new base.
 */
export async function extractPatch(
  baseOriginal: string,
  userModified: string
): Promise<DiffResult> {
  // This is essentially the same as diff, but optimized for patch creation
  const result = await diff(baseOriginal, userModified);

  // Filter out KEEP operations for patches (we only need changes)
  const patchEdits = result.edits.filter((e) => e.operation !== "KEEP");

  // Add insertion anchors based on context
  for (let i = 0; i < patchEdits.length; i++) {
    const edit = patchEdits[i]!;
    if (edit.operation === "INSERT" && !edit.anchor) {
      // Find the preceding edit to use as anchor
      const prevEdit = patchEdits[i - 1];
      if (prevEdit) {
        edit.anchor = prevEdit.anchor;
        edit.position = "after";
      }
    }
  }

  return {
    edits: patchEdits,
    stats: result.stats,
  };
}

/**
 * Summarize a diff result as a human-readable string.
 */
export function summarizeDiff(result: DiffResult): string {
  const { stats } = result;
  const parts: string[] = [];

  if (stats.kept > 0) parts.push(`${stats.kept} unchanged`);
  if (stats.inserted > 0) parts.push(`${stats.inserted} added`);
  if (stats.deleted > 0) parts.push(`${stats.deleted} removed`);
  if (stats.replaced > 0) parts.push(`${stats.replaced} modified`);
  if (stats.moved > 0) parts.push(`${stats.moved} moved`);

  return parts.join(", ") || "No changes";
}

export type { Edit, EditOperation, DiffResult };
