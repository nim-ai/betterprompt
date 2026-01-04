/**
 * Patch module.
 * Create and apply portable patches for text upgrades.
 */

import type {
  Patch,
  PatchApplicationResult,
  Edit,
  SemanticUnit,
} from "../types/index.js";
import { segment } from "../segmentation/index.js";
import { extractPatch as extractDiffPatch } from "../diff/index.js";
import { createHash } from "../utils/hash.js";
import { levenshteinSimilarity } from "../utils/similarity.js";

/**
 * Current patch format version.
 */
const PATCH_VERSION = "1.0.0";

/**
 * Generate a patch from user modifications.
 *
 * @param baseOriginal - The original base text
 * @param userModified - The user's modified version
 */
export async function generatePatch(
  baseOriginal: string,
  userModified: string
): Promise<Patch> {
  const diffResult = await extractDiffPatch(baseOriginal, userModified);

  return {
    version: PATCH_VERSION,
    baseHash: createHash(baseOriginal),
    createdAt: new Date().toISOString(),
    edits: diffResult.edits,
  };
}

/**
 * Apply a patch to a new base text.
 *
 * @param newBase - The new base text to apply the patch to
 * @param patch - The patch to apply
 */
export async function applyPatch(
  newBase: string,
  patch: Patch
): Promise<PatchApplicationResult> {
  const applied: Edit[] = [];
  const failed: Edit[] = [];
  const adapted: Edit[] = [];

  // Segment the new base
  const segNewBase = segment(newBase);
  const unitsByHash = new Map<string, SemanticUnit>();
  for (const unit of segNewBase.units) {
    unitsByHash.set(unit.hash, unit);
  }

  // Build result from new base
  const resultUnits = [...segNewBase.units];
  const modifications = new Map<string, Edit>();
  const insertions: Array<{ afterHash: string; edit: Edit }> = [];
  const deletions = new Set<string>();

  // Process each edit in the patch
  for (const edit of patch.edits) {
    // Handle INSERT at beginning (empty/no anchor)
    if (edit.operation === "INSERT" && !edit.anchor) {
      insertions.push({ afterHash: "", edit });
      applied.push(edit);
      continue;
    }

    const anchor = findAnchor(edit, segNewBase.units);

    if (!anchor) {
      // Anchor not found - edit failed
      failed.push(edit);
      continue;
    }

    // Check if anchor context changed significantly
    const contextChanged = hasContextChanged(edit, anchor);

    switch (edit.operation) {
      case "REPLACE":
        if (contextChanged) {
          // Adapt the edit - apply with lower confidence
          const adaptedEdit = { ...edit, confidence: edit.confidence * 0.7 };
          modifications.set(anchor.hash, adaptedEdit);
          adapted.push(adaptedEdit);
        } else {
          modifications.set(anchor.hash, edit);
          applied.push(edit);
        }
        break;

      case "DELETE":
        deletions.add(anchor.hash);
        if (contextChanged) {
          adapted.push(edit);
        } else {
          applied.push(edit);
        }
        break;

      case "INSERT":
        insertions.push({ afterHash: anchor.hash, edit });
        if (contextChanged) {
          adapted.push(edit);
        } else {
          applied.push(edit);
        }
        break;

      case "KEEP":
        // No action needed
        applied.push(edit);
        break;
    }
  }

  // Apply modifications and build result
  const finalUnits: SemanticUnit[] = [];

  for (const unit of resultUnits) {
    // Check if deleted
    if (deletions.has(unit.hash)) {
      continue;
    }

    // Check if modified
    const mod = modifications.get(unit.hash);
    if (mod && mod.newContent) {
      const newUnit: SemanticUnit = {
        ...unit,
        content: mod.newContent,
        hash: createHash(mod.newContent.toLowerCase()),
      };
      finalUnits.push(newUnit);
    } else {
      finalUnits.push(unit);
    }

    // Check for insertions after this unit
    for (const { afterHash, edit: insertEdit } of insertions) {
      if (afterHash === unit.hash && insertEdit.newContent) {
        const insertedUnit: SemanticUnit = {
          content: insertEdit.newContent,
          hash: createHash(insertEdit.newContent.toLowerCase()),
          index: finalUnits.length,
          start: 0,
          end: insertEdit.newContent.length,
          prefix: " ",
          suffix: "",
        };
        finalUnits.push(insertedUnit);
      }
    }
  }

  // Handle insertions at the beginning (no anchor)
  for (const { afterHash, edit: insertEdit } of insertions) {
    if (!afterHash && insertEdit.newContent) {
      const insertedUnit: SemanticUnit = {
        content: insertEdit.newContent,
        hash: createHash(insertEdit.newContent.toLowerCase()),
        index: 0,
        start: 0,
        end: insertEdit.newContent.length,
        prefix: "",
        suffix: " ",
      };
      finalUnits.unshift(insertedUnit);
    }
  }

  // Reconstruct the result
  let result = "";
  for (const unit of finalUnits) {
    result += unit.prefix + unit.content + unit.suffix;
  }

  return {
    result: result.trim(),
    applied,
    failed,
    adapted,
  };
}

/**
 * Find the anchor unit in the new base.
 */
function findAnchor(
  edit: Edit,
  units: SemanticUnit[]
): SemanticUnit | undefined {
  // First try exact hash match
  const exactMatch = units.find((u) => u.hash === edit.anchor);
  if (exactMatch) return exactMatch;

  // Try content match (if we have old content)
  if (edit.oldContent) {
    const contentHash = createHash(edit.oldContent.toLowerCase());
    const contentMatch = units.find((u) => u.hash === contentHash);
    if (contentMatch) return contentMatch;

    // Try fuzzy matching based on similarity
    let bestMatch: SemanticUnit | undefined;
    let bestSimilarity = 0.6; // Minimum threshold

    for (const unit of units) {
      const similarity = levenshteinSimilarity(
        edit.oldContent.toLowerCase(),
        unit.content.toLowerCase()
      );
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = unit;
      }
    }

    if (bestMatch) return bestMatch;
  }

  // Try context-based matching
  if (edit.anchorContext) {
    for (const unit of units) {
      const beforeMatch =
        !edit.anchorContext.before ||
        unit.prefix.includes(edit.anchorContext.before);
      const afterMatch =
        !edit.anchorContext.after ||
        unit.suffix.includes(edit.anchorContext.after);

      if (beforeMatch && afterMatch) {
        return unit;
      }
    }
  }

  return undefined;
}

/**
 * Check if the context around an anchor has changed significantly.
 */
function hasContextChanged(edit: Edit, anchor: SemanticUnit): boolean {
  if (!edit.anchorContext) return false;

  const beforeSimilarity = edit.anchorContext.before
    ? levenshteinSimilarity(edit.anchorContext.before, anchor.prefix)
    : 1;
  const afterSimilarity = edit.anchorContext.after
    ? levenshteinSimilarity(edit.anchorContext.after, anchor.suffix)
    : 1;

  // Context changed if similarity is below threshold
  return beforeSimilarity < 0.7 || afterSimilarity < 0.7;
}

/**
 * Serialize a patch to JSON.
 */
export function serializePatch(patch: Patch): string {
  return JSON.stringify(patch, null, 2);
}

/**
 * Deserialize a patch from JSON.
 */
export function deserializePatch(json: string): Patch {
  const parsed = JSON.parse(json) as Patch;

  // Validate version
  if (!parsed.version) {
    throw new Error("Invalid patch: missing version");
  }

  // Validate required fields
  if (!parsed.edits || !Array.isArray(parsed.edits)) {
    throw new Error("Invalid patch: missing or invalid edits");
  }

  return parsed;
}

/**
 * Check if a patch is compatible with a given base.
 */
export function isPatchCompatible(patch: Patch, base: string): boolean {
  const baseHash = createHash(base);

  // Exact match
  if (patch.baseHash === baseHash) return true;

  // Could add fuzzy compatibility checking here
  return false;
}

export type { Patch, PatchApplicationResult };
