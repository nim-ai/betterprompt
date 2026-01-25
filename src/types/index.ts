/**
 * Core types for betterprompt
 */

// =============================================================================
// Segmentation Types
// =============================================================================

/**
 * A semantic unit is the atomic unit of text for merging.
 * Can be a sentence, clause, or paragraph depending on configuration.
 */
export interface SemanticUnit {
  /** The text content of this unit */
  content: string;
  /** Unique identifier based on normalized content */
  hash: string;
  /** Original position in the source text */
  index: number;
  /** Start character offset in original text */
  start: number;
  /** End character offset in original text */
  end: number;
  /** Preserved whitespace/formatting before this unit */
  prefix: string;
  /** Preserved whitespace/formatting after this unit */
  suffix: string;
  /** Optional metadata (e.g., markdown structure) */
  metadata?: Record<string, unknown>;
}

/**
 * Result of segmenting a text into semantic units.
 */
export interface SegmentationResult {
  /** The semantic units extracted from the text */
  units: SemanticUnit[];
  /** The original text */
  original: string;
}

/**
 * Options for text segmentation.
 */
export interface SegmentationOptions {
  /** Granularity of segmentation */
  granularity?: "sentence" | "paragraph" | "section" | "clause";
  /** Preserve markdown structure */
  preserveMarkdown?: boolean;
  /** Custom sentence boundary patterns */
  customBoundaries?: RegExp[];
}

// =============================================================================
// Embedding Types
// =============================================================================

/**
 * Interface for embedding providers.
 * Allows plugging in different embedding models.
 */
export interface EmbeddingProvider {
  /** Generate embeddings for a list of texts */
  embed(texts: string[]): Promise<number[][]>;
  /** Dimensionality of the embeddings */
  readonly dimension: number;
  /** Name/identifier of the provider */
  readonly name: string;
}

/**
 * Similarity result between two semantic units.
 */
export interface SimilarityResult {
  /** The similarity score (0-1) */
  score: number;
  /** Classification based on thresholds */
  classification: "identical" | "equivalent" | "similar" | "different";
}

/**
 * Options for similarity computation.
 */
export interface SimilarityOptions {
  /** Threshold for "equivalent" (same meaning) */
  equivalentThreshold?: number;
  /** Threshold for "similar" (related content) */
  similarThreshold?: number;
}

// =============================================================================
// Alignment Types
// =============================================================================

/**
 * A pair of aligned semantic units.
 */
export interface AlignedPair {
  /** Unit from the source text (null if insertion) */
  source: SemanticUnit | null;
  /** Unit from the target text (null if deletion) */
  target: SemanticUnit | null;
  /** Similarity score between the pair */
  similarity: number;
  /** Type of alignment */
  type: "match" | "insertion" | "deletion" | "modification";
}

/**
 * Result of aligning two texts.
 */
export interface AlignmentResult {
  /** Aligned pairs of semantic units */
  pairs: AlignedPair[];
  /** Unmatched units from source */
  unmatchedSource: SemanticUnit[];
  /** Unmatched units from target */
  unmatchedTarget: SemanticUnit[];
}

/**
 * Options for alignment.
 */
export interface AlignmentOptions {
  /** Strategy for alignment */
  strategy?: "sequential" | "semantic" | "hybrid";
  /** Minimum similarity for a match */
  matchThreshold?: number;
  /** Use position hints for disambiguation */
  usePositionHints?: boolean;
}

// =============================================================================
// Edit/Diff Types
// =============================================================================

/**
 * Types of edit operations.
 */
export type EditOperation = "KEEP" | "INSERT" | "DELETE" | "REPLACE" | "MOVE";

/**
 * An atomic edit representing a single change.
 */
export interface Edit {
  /** The type of operation */
  operation: EditOperation;
  /** Semantic hash of the anchor (original content) */
  anchor: string;
  /** Surrounding context for fallback matching */
  anchorContext?:
    | {
        before: string;
        after: string;
      }
    | undefined;
  /** Original content (for DELETE, REPLACE) */
  oldContent?: string | undefined;
  /** New content (for INSERT, REPLACE) */
  newContent?: string | undefined;
  /** Position relative to anchor (for INSERT) */
  position?: "before" | "after" | "replace" | undefined;
  /** Confidence in this edit's applicability */
  confidence: number;
}

/**
 * Result of extracting edits between two texts.
 */
export interface DiffResult {
  /** List of edits */
  edits: Edit[];
  /** Statistics about the diff */
  stats: {
    kept: number;
    inserted: number;
    deleted: number;
    replaced: number;
    moved: number;
  };
}

// =============================================================================
// Patch Types
// =============================================================================

/**
 * A serializable patch that can be applied to upgrade text.
 */
export interface Patch {
  /** Patch format version */
  version: string;
  /** Hash of the original base text */
  baseHash: string;
  /** Timestamp of patch creation */
  createdAt: string;
  /** List of edits in the patch */
  edits: Edit[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of applying a patch.
 */
export interface PatchApplicationResult {
  /** The resulting text after applying the patch */
  result: string;
  /** Edits that were applied successfully */
  applied: Edit[];
  /** Edits that failed to apply */
  failed: Edit[];
  /** Edits that required adaptation */
  adapted: Edit[];
}

// =============================================================================
// Merge Types
// =============================================================================

/**
 * Strategy for resolving conflicts.
 *
 * - "prefer-a": Take A's version (the original/ancestor)
 * - "prefer-b": Take B's version (the new/upgraded content)
 * - "prefer-c": Take C's version (the user's customization)
 * - "concatenate": Include both B and C content
 * - "defer": Leave conflict markers for manual resolution
 */
export type ConflictStrategy =
  | "prefer-a"
  | "prefer-b"
  | "prefer-c"
  | "concatenate"
  | "defer";

/**
 * A merge conflict that needs resolution.
 *
 * In 3-way merge terminology:
 * - A: The original/ancestor version
 * - B: The new/upgraded version
 * - C: The user's customized version
 */
export interface Conflict {
  /** Unique identifier for this conflict */
  id: string;
  /** Content from A (original/ancestor) */
  a: string;
  /** Content from B (new/upgraded) */
  b: string;
  /** Content from C (user's customized version) */
  c: string;
  /** Surrounding context */
  context: {
    before: string;
    after: string;
  };
  /** Semantic similarity scores */
  similarities: {
    aToB: number;
    aToC: number;
    bToC: number;
  };
  /** Suggested resolution (if determinable) */
  suggestion?: {
    resolution: string;
    confidence: number;
    reason: string;
  };
}

/**
 * Resolution for a conflict.
 */
export interface Resolution {
  /** The conflict being resolved */
  conflictId: string;
  /** The resolved content */
  resolved: string;
  /** Source of the resolution */
  source: "ancestor" | "base" | "user" | "merged" | "external";
  /** Confidence in the resolution */
  confidence: number;
}

/**
 * Result of a three-way merge.
 *
 * A 3-way merge takes:
 * - A: The original/ancestor version
 * - B: The new/upgraded version
 * - C: The user's customized version
 */
export interface MergeResult {
  /** The merged text */
  merged: string;
  /** Any unresolved conflicts */
  conflicts: Conflict[];
  /** Resolutions that were applied */
  resolutions: Resolution[];
  /** Statistics about the merge */
  stats: {
    /** Units unchanged from B */
    unchanged: number;
    /** Units upgraded from A to B */
    upgraded: number;
    /** C customizations preserved */
    preserved: number;
    /** Units removed by C (present in A but not in C) */
    removed: number;
    /** Conflicts detected */
    conflicts: number;
    /** Conflicts auto-resolved */
    autoResolved: number;
  };
}

/**
 * Options for merging.
 */
export interface MergeOptions {
  /**
   * Strategy for resolving conflicts.
   * - "prefer-a": Take A's version (the original/ancestor)
   * - "prefer-b": Take B's version (the new/upgraded content)
   * - "prefer-c": Take C's version (the user's customization)
   * - "concatenate": Include both B and C content
   * - "defer": Leave conflict markers for manual resolution (default)
   */
  conflictStrategy?: ConflictStrategy;
  /** Custom conflict resolver */
  resolver?: ConflictResolver;
  /** Similarity thresholds */
  thresholds?: SimilarityOptions;
  /**
   * Minimum similarity score (0-1) for two segments to be considered a match.
   * Higher values require more similar content to align.
   * Default: 0.75
   */
  matchThreshold?: number;
}

// =============================================================================
// Extension Interfaces
// =============================================================================

/**
 * Interface for external conflict resolvers (e.g., LLM-based).
 * This is an extension point - implementations are out of scope.
 */
export interface ConflictResolver {
  /** Resolve a single conflict */
  resolve(conflict: Conflict): Promise<Resolution>;
  /** Optionally resolve multiple conflicts in batch */
  resolveBatch?(conflicts: Conflict[]): Promise<Resolution[]>;
}

/**
 * Interface for quality comparison (e.g., LLM-as-judge).
 * This is an extension point - implementations are out of scope.
 */
export interface QualityComparator {
  /** Compare two texts and determine which is higher quality */
  compare(
    textA: string,
    textB: string,
    context?: string
  ): Promise<{
    winner: "a" | "b" | "tie";
    confidence: number;
    reason?: string;
  }>;
}
