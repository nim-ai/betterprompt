/**
 * betterprompt
 *
 * Language-agnostic algorithm for intelligently merging and upgrading
 * natural language text, treating edits as first-class semantic operations.
 *
 * @packageDocumentation
 */

// Core functionality
export { segment, reconstruct } from "./segmentation/index.js";
export { align } from "./alignment/index.js";
export { diff, extractPatch, summarizeDiff } from "./diff/index.js";
export { merge, hasConflicts, resolveConflict } from "./merge/index.js";
export {
  generatePatch,
  applyPatch,
  serializePatch,
  deserializePatch,
  isPatchCompatible,
} from "./patch/index.js";

// Embedding providers
export {
  Model2VecEmbeddingProvider,
  CachedEmbeddingProvider,
  CharFrequencyEmbeddingProvider,
  EmbeddingCache,
  getDefaultProvider,
  setDefaultProvider,
  initBrowserEmbeddings,
} from "./embeddings/index.js";

// Utilities
export {
  createHash,
  createContextualHash,
  cosineSimilarity,
  levenshteinSimilarity,
  levenshteinDistance,
  classifySimilarity,
  DEFAULT_THRESHOLDS,
} from "./utils/index.js";

// Types
export type {
  // Segmentation
  SemanticUnit,
  SegmentationResult,
  SegmentationOptions,
  // Embeddings
  EmbeddingProvider,
  SimilarityResult,
  SimilarityOptions,
  // Alignment
  AlignedPair,
  AlignmentResult,
  AlignmentOptions,
  // Diff
  Edit,
  EditOperation,
  DiffResult,
  // Patch
  Patch,
  PatchApplicationResult,
  // Merge
  MergeResult,
  MergeOptions,
  ConflictStrategy,
  Conflict,
  Resolution,
  // Extensions
  ConflictResolver,
  QualityComparator,
} from "./types/index.js";
