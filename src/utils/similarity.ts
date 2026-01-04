/**
 * Similarity computation utilities.
 */

import type { SimilarityResult, SimilarityOptions } from "../types/index.js";

/**
 * Default similarity thresholds.
 */
export const DEFAULT_THRESHOLDS: Required<SimilarityOptions> = {
  equivalentThreshold: 0.95,
  similarThreshold: 0.8,
};

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Classify similarity based on thresholds.
 */
export function classifySimilarity(
  score: number,
  options: SimilarityOptions = {}
): SimilarityResult {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options };

  let classification: SimilarityResult["classification"];

  if (score >= 0.9999) {
    classification = "identical";
  } else if (score >= thresholds.equivalentThreshold) {
    classification = "equivalent";
  } else if (score >= thresholds.similarThreshold) {
    classification = "similar";
  } else {
    classification = "different";
  }

  return { score, classification };
}

/**
 * Compute Levenshtein distance between two strings.
 * Useful for fallback when embeddings aren't available.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Compute normalized Levenshtein similarity (0-1).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}
