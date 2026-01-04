/**
 * Merge module.
 * Three-way merge for text with semantic awareness.
 */

import type {
  MergeResult,
  MergeOptions,
  ConflictStrategy,
  Conflict,
  Resolution,
  SemanticUnit,
  AlignedPair,
} from "../types/index.js";
import { segment, reconstruct } from "../segmentation/index.js";
import { align } from "../alignment/index.js";
import { createHash } from "../utils/hash.js";
import { wordMerge3Way } from "./word-merge.js";

/**
 * Normalize conflict strategy, defaulting to "prefer-c".
 */
function normalizeStrategy(
  strategy: ConflictStrategy | undefined
): ConflictStrategy {
  return strategy ?? "prefer-c";
}

/**
 * Default merge options.
 */
const DEFAULT_OPTIONS = {
  conflictStrategy: "prefer-c" as const,
  thresholds: {
    equivalentThreshold: 0.95,
    similarThreshold: 0.8,
  },
  resolver: undefined as undefined,
};

/**
 * Generate a unique conflict ID.
 */
function generateConflictId(): string {
  return `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Perform a three-way merge.
 *
 * In 3-way merge terminology:
 * - A: The original/ancestor version
 * - B: The new/upgraded version
 * - C: The user's customized version (derived from A)
 *
 * @param a - The original/ancestor text
 * @param b - The new/upgraded text
 * @param c - The user's customized version
 * @param options - Merge options
 */
export async function merge(
  a: string,
  b: string,
  c: string,
  options: MergeOptions = {}
): Promise<MergeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Segment all three versions
  const segA = segment(a);
  const segB = segment(b);
  const segC = segment(c);

  // Align A ↔ B to understand upstream changes
  const abAlignment = await align(segA.units, segB.units);

  // Align A ↔ C to understand user changes
  const acAlignment = await align(segA.units, segC.units);

  // Build lookup maps for quick access
  const aToB = new Map<string, AlignedPair>();
  const aToC = new Map<string, AlignedPair>();

  for (const pair of abAlignment.pairs) {
    if (pair.source) {
      aToB.set(pair.source.hash, pair);
    }
  }

  for (const pair of acAlignment.pairs) {
    if (pair.source) {
      aToC.set(pair.source.hash, pair);
    }
  }

  // Process each unit and decide what to do
  const mergedUnits: SemanticUnit[] = [];
  const conflicts: Conflict[] = [];
  const resolutions: Resolution[] = [];
  const stats = {
    unchanged: 0,
    upgraded: 0,
    preserved: 0,
    removed: 0,
    conflicts: 0,
    autoResolved: 0,
  };

  // Track which B and C units have been processed
  const processedBUnits = new Set<string>();
  const processedCUnits = new Set<string>();

  // Process units from A perspective
  for (const aUnit of segA.units) {
    const bChange = aToB.get(aUnit.hash);
    const cChange = aToC.get(aUnit.hash);

    // Check if content actually changed (not just alignment type)
    // A "match" type means units correspond, but content may still differ
    const bContentChanged =
      bChange?.target && bChange.target.content !== aUnit.content;
    const bChanged =
      bChange?.type === "modification" ||
      bChange?.type === "deletion" ||
      bContentChanged;

    const cContentChanged =
      cChange?.target && cChange.target.content !== aUnit.content;
    const cChanged =
      cChange?.type === "modification" ||
      cChange?.type === "deletion" ||
      cContentChanged;

    if (!bChanged && !cChanged) {
      // Case 1: No changes on either side → use B (might be identical)
      const bUnit = bChange?.target ?? aUnit;
      mergedUnits.push(bUnit);
      if (bChange?.target) {
        processedBUnits.add(bChange.target.hash);
      }
      stats.unchanged++;
    } else if (bChanged && !cChanged) {
      // Case 2: Only B changed → take B upgrade
      if (bChange?.target) {
        mergedUnits.push(bChange.target);
        processedBUnits.add(bChange.target.hash);
        stats.upgraded++;
      }
      // If deleted in B and C didn't change, just drop it
    } else if (!bChanged && cChanged) {
      // Case 3: Only C changed → preserve C customization
      if (cChange?.target) {
        mergedUnits.push(cChange.target);
        processedCUnits.add(cChange.target.hash);
        stats.preserved++;
      } else {
        // Deleted by C, respect that removal
        stats.removed++;
      }
    } else {
      // Case 4: Both changed → try word-level merge, but apply strategy if needed

      // When alignment produces deletion+insertion instead of modification,
      // we need to find the corresponding insertion to get the actual content.
      let bContent = bChange?.target?.content ?? "";
      let cContent = cChange?.target?.content ?? "";

      // If bChange is a deletion (target is null), look for a B insertion at similar position
      if (bChange?.type === "deletion" && !bChange.target) {
        // Find insertion at same index position, or closest unprocessed insertion
        const bInsertion =
          abAlignment.pairs.find(
            (p) =>
              p.type === "insertion" &&
              p.target &&
              !processedBUnits.has(p.target.hash) &&
              p.target.index === aUnit.index
          ) ??
          abAlignment.pairs.find(
            (p) =>
              p.type === "insertion" &&
              p.target &&
              !processedBUnits.has(p.target.hash)
          );
        if (bInsertion?.target) {
          bContent = bInsertion.target.content;
          processedBUnits.add(bInsertion.target.hash);
        }
      }

      // If cChange is a deletion (target is null), look for a C insertion at similar position
      if (cChange?.type === "deletion" && !cChange.target) {
        // Find insertion at same index position, or closest unprocessed insertion
        const cInsertion =
          acAlignment.pairs.find(
            (p) =>
              p.type === "insertion" &&
              p.target &&
              !processedCUnits.has(p.target.hash) &&
              p.target.index === aUnit.index
          ) ??
          acAlignment.pairs.find(
            (p) =>
              p.type === "insertion" &&
              p.target &&
              !processedCUnits.has(p.target.hash)
          );
        if (cInsertion?.target) {
          cContent = cInsertion.target.content;
          processedCUnits.add(cInsertion.target.hash);
        }
      }

      // Track if C removed this unit
      // Either cContent is empty (explicit deletion), or the similarity is so low
      // that C's content is effectively a replacement, not a modification
      const REMOVAL_SIMILARITY_THRESHOLD = 0.5;
      const cRemovedUnit =
        cContent === "" ||
        (cChange?.similarity !== undefined &&
          cChange.similarity < REMOVAL_SIMILARITY_THRESHOLD);

      // Try word-level merge first for finer granularity
      const wordMergeResult = wordMerge3Way(aUnit.content, bContent, cContent);

      // Check if word-merge produced a clean result that equals one of the inputs
      // If it created a hybrid (neither B nor C), treat as conflict and apply strategy
      const mergedEqualsB = wordMergeResult.merged === bContent;
      const mergedEqualsC = wordMergeResult.merged === cContent;
      const isCleanMerge =
        !wordMergeResult.hasConflict && (mergedEqualsB || mergedEqualsC);

      // Get the strategy to decide behavior
      const strategy = normalizeStrategy(opts.conflictStrategy);

      if (!wordMergeResult.hasConflict && isCleanMerge) {
        // Word-level merge resulted in one of the originals
        // But we need to respect the strategy when there's a clear preference
        let mergedContent = wordMergeResult.merged;

        // If strategy prefers B but merge chose C (or vice versa), override
        if (strategy === "prefer-b" && mergedEqualsC && !mergedEqualsB) {
          mergedContent = bContent;
        } else if (strategy === "prefer-c" && mergedEqualsB && !mergedEqualsC) {
          mergedContent = cContent;
        }

        if (mergedContent) {
          const resolvedUnit: SemanticUnit = {
            content: mergedContent,
            hash: createHash(mergedContent.toLowerCase()),
            index: mergedUnits.length,
            start: 0,
            end: mergedContent.length,
            prefix: aUnit.prefix,
            suffix: aUnit.suffix,
          };
          mergedUnits.push(resolvedUnit);

          // If merged to C and C removed/replaced A's content, count as removal
          if (cRemovedUnit && mergedEqualsC) {
            stats.removed++;
          }
        } else if (cRemovedUnit) {
          // Clean merge resulted in empty = C's removal was applied
          stats.removed++;
        }
        stats.autoResolved++;

        if (cChange?.target) {
          processedCUnits.add(cChange.target.hash);
        }
      } else if (!wordMergeResult.hasConflict && strategy === "defer") {
        // Word-merge succeeded but created a hybrid - with defer, use the merge
        const mergedContent = wordMergeResult.merged;

        if (mergedContent) {
          const resolvedUnit: SemanticUnit = {
            content: mergedContent,
            hash: createHash(mergedContent.toLowerCase()),
            index: mergedUnits.length,
            start: 0,
            end: mergedContent.length,
            prefix: aUnit.prefix,
            suffix: aUnit.suffix,
          };
          mergedUnits.push(resolvedUnit);

          resolutions.push({
            conflictId: generateConflictId(),
            resolved: mergedContent,
            source: "merged",
            confidence: 0.85,
          });
        } else if (cRemovedUnit) {
          stats.removed++;
        }
        stats.autoResolved++;

        if (cChange?.target) {
          processedCUnits.add(cChange.target.hash);
        }
      } else {
        // Either word-merge has conflicts, or it created a hybrid and we have a preference
        // Treat as sentence-level conflict and apply strategy
        stats.conflicts++;

        const conflict: Conflict = {
          id: generateConflictId(),
          a: aUnit.content,
          b: bContent,
          c: cContent,
          context: {
            before: aUnit.prefix,
            after: aUnit.suffix,
          },
          similarities: {
            aToB: bChange?.similarity ?? 0,
            aToC: cChange?.similarity ?? 0,
            bToC: 0,
          },
        };

        const resolution = tryAutoResolve(conflict, strategy);

        if (resolution) {
          resolutions.push(resolution);
          stats.autoResolved++;

          // Only add to merged output if there's actual content
          // Empty resolution means the unit was effectively removed
          if (resolution.resolved) {
            const resolvedUnit: SemanticUnit = {
              content: resolution.resolved,
              hash: createHash(resolution.resolved.toLowerCase()),
              index: mergedUnits.length,
              start: 0,
              end: resolution.resolved.length,
              prefix: aUnit.prefix,
              suffix: aUnit.suffix,
            };
            mergedUnits.push(resolvedUnit);

            // If C removed/replaced A's content and C's content was used, count as removal
            // (A's original content is gone, replaced by C's different content)
            if (cRemovedUnit && resolution.source === "user") {
              stats.removed++;
            }
          } else if (cRemovedUnit) {
            // C's removal was applied (resolved to empty)
            stats.removed++;
          }

          if (bChange?.target) {
            processedBUnits.add(bChange.target.hash);
          }
          if (cChange?.target) {
            processedCUnits.add(cChange.target.hash);
          }
        } else {
          // Conflict remains unresolved (defer strategy)
          conflicts.push(conflict);

          const conflictMarker = formatConflictMarker(conflict);
          const conflictUnit: SemanticUnit = {
            content: conflictMarker,
            hash: createHash(conflictMarker),
            index: mergedUnits.length,
            start: 0,
            end: conflictMarker.length,
            prefix: aUnit.prefix,
            suffix: aUnit.suffix,
            metadata: { conflict: true, conflictId: conflict.id },
          };
          mergedUnits.push(conflictUnit);

          if (cChange?.target) {
            processedCUnits.add(cChange.target.hash);
          }
        }
      }
    }
  }

  // Handle C insertions (new content that wasn't in A)
  const strategy = normalizeStrategy(opts.conflictStrategy);
  for (const pair of acAlignment.pairs) {
    if (pair.type === "insertion" && pair.target) {
      if (!processedCUnits.has(pair.target.hash)) {
        // Check if this C insertion replaces something that B deleted
        // This happens when A→C has both a deletion and an insertion at similar positions
        // indicating C "replaced" something, and B also deleted that same thing
        const cInsertIdx = pair.target.index;

        // Find if A→C also has a deletion near this insertion position
        // (suggesting C replaced rather than purely inserted)
        const acDeletionNearby = acAlignment.pairs.find(
          (p) =>
            p.type === "deletion" &&
            p.source &&
            Math.abs(p.source.index - cInsertIdx) <= 1
        );

        // If C replaced something from A, check if B also deleted that same A unit
        let bDeletedSameUnit = false;
        if (acDeletionNearby?.source) {
          bDeletedSameUnit = abAlignment.pairs.some(
            (p) =>
              p.type === "deletion" &&
              p.source &&
              p.source.hash === acDeletionNearby.source!.hash
          );
        }

        if (bDeletedSameUnit && strategy === "prefer-b") {
          // C replaced what B deleted - with prefer-b, respect B's deletion
          processedCUnits.add(pair.target.hash);
          continue;
        }

        // C added new content - preserve it
        mergedUnits.push(pair.target);
        processedCUnits.add(pair.target.hash);
        stats.preserved++;
      }
    }
  }

  // Handle B insertions (new content in B)
  for (const pair of abAlignment.pairs) {
    if (pair.type === "insertion" && pair.target) {
      // Skip if already processed
      if (processedBUnits.has(pair.target.hash)) {
        continue;
      }

      // Check if this B insertion replaces something that C deleted
      const bInsertIdx = pair.target.index;

      // Find if A→B also has a deletion near this insertion position
      const abDeletionNearby = abAlignment.pairs.find(
        (p) =>
          p.type === "deletion" &&
          p.source &&
          Math.abs(p.source.index - bInsertIdx) <= 1
      );

      // If B replaced something from A, check if C also deleted that same A unit
      let cDeletedSameUnit = false;
      if (abDeletionNearby?.source) {
        cDeletedSameUnit = acAlignment.pairs.some(
          (p) =>
            p.type === "deletion" &&
            p.source &&
            p.source.hash === abDeletionNearby.source!.hash
        );
      }

      if (cDeletedSameUnit && strategy === "prefer-c") {
        // B replaced what C deleted - with prefer-c, respect C's deletion
        processedBUnits.add(pair.target.hash);
        continue;
      }

      // B added new content - include it unless C has similar content
      const cHasSimilar = segC.units.some((u) => u.hash === pair.target?.hash);
      if (!cHasSimilar) {
        mergedUnits.push(pair.target);
        processedBUnits.add(pair.target.hash);
        stats.upgraded++;
      }
    }
  }

  // Sort merged units by original position (best effort)
  mergedUnits.sort((a, b) => {
    // Prefer original index, fall back to hash comparison
    if (a.index !== b.index) return a.index - b.index;
    return a.hash.localeCompare(b.hash);
  });

  // Reconstruct the final text
  const merged = reconstruct(mergedUnits);

  return {
    merged,
    conflicts,
    resolutions,
    stats,
  };
}

/**
 * Try to auto-resolve a conflict based on strategy.
 */
function tryAutoResolve(
  conflict: Conflict,
  strategy: "prefer-a" | "prefer-b" | "prefer-c" | "concatenate" | "defer"
): Resolution | null {
  // Check for subsumption (one version contains the other's meaning)
  // If B fully contains C's content, use B (it's more complete)
  // If C fully contains B's content, use C (it's more complete)
  // Skip subsumption if either side is empty (deletion) - fall through to strategy
  const bIsEmpty = conflict.b.trim() === "";
  const cIsEmpty = conflict.c.trim() === "";

  if (!bIsEmpty && !cIsEmpty) {
    const bSubsumesC =
      conflict.b.includes(conflict.c) || conflict.similarities.bToC > 0.95;
    const cSubsumesB =
      conflict.c.includes(conflict.b) || conflict.similarities.bToC > 0.95;

    if (bSubsumesC && !cSubsumesB) {
      return {
        conflictId: conflict.id,
        resolved: conflict.b,
        source: "base",
        confidence: 0.9,
      };
    }

    if (cSubsumesB && !bSubsumesC) {
      return {
        conflictId: conflict.id,
        resolved: conflict.c,
        source: "user",
        confidence: 0.9,
      };
    }
  }

  // Apply conflict strategy
  switch (strategy) {
    case "prefer-a":
      return {
        conflictId: conflict.id,
        resolved: conflict.a,
        source: "ancestor",
        confidence: 0.7,
      };

    case "prefer-b":
      return {
        conflictId: conflict.id,
        resolved: conflict.b,
        source: "base",
        confidence: 0.7,
      };

    case "prefer-c":
      return {
        conflictId: conflict.id,
        resolved: conflict.c,
        source: "user",
        confidence: 0.7,
      };

    case "concatenate": {
      const combined = `${conflict.b}\n${conflict.c}`;
      return {
        conflictId: conflict.id,
        resolved: combined,
        source: "merged",
        confidence: 0.5,
      };
    }

    case "defer":
    default:
      return null;
  }
}

/**
 * Format a conflict marker for unresolved conflicts.
 */
function formatConflictMarker(conflict: Conflict): string {
  return `<<<<<<< B
${conflict.b}
=======
${conflict.c}
>>>>>>> C`;
}

/**
 * Check if a merged result has unresolved conflicts.
 */
export function hasConflicts(result: MergeResult): boolean {
  return result.conflicts.length > 0;
}

/**
 * Resolve a conflict manually and update the merged result.
 */
export function resolveConflict(
  result: MergeResult,
  conflictId: string,
  resolution: string
): MergeResult {
  const conflict = result.conflicts.find((c) => c.id === conflictId);
  if (!conflict) {
    throw new Error(`Conflict not found: ${conflictId}`);
  }

  // Remove conflict from list
  const remainingConflicts = result.conflicts.filter(
    (c) => c.id !== conflictId
  );

  // Replace conflict marker in merged text
  const marker = formatConflictMarker(conflict);
  const newMerged = result.merged.replace(marker, resolution);

  // Add resolution
  const newResolution: Resolution = {
    conflictId,
    resolved: resolution,
    source: "external",
    confidence: 1.0,
  };

  return {
    ...result,
    merged: newMerged,
    conflicts: remainingConflicts,
    resolutions: [...result.resolutions, newResolution],
  };
}

export type {
  MergeResult,
  MergeOptions,
  ConflictStrategy,
  Conflict,
  Resolution,
};
