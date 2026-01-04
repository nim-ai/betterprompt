/**
 * Browser-specific entry point for betterprompt.
 *
 * This module bundles all dependencies for use in browsers,
 * particularly for the GitHub Pages demo.
 *
 * Call initBrowser() to load the ML model for semantic embeddings.
 * If not called, falls back to char-frequency similarity.
 *
 * @packageDocumentation
 */

// Re-export everything from main
export * from "./index.js";

import {
  initBrowserEmbeddings,
  isMLEmbeddingsActive,
} from "./embeddings/index.js";

export { isMLEmbeddingsActive };

// Browser-specific utilities

/**
 * Check if running in a browser environment.
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Default model path for browser (relative to current page).
 */
const DEFAULT_MODEL_PATH = "./models/m2v-base-output";

/**
 * Initialize the library for browser use with ML embeddings.
 * Loads the bundled M2V model for semantic similarity.
 *
 * @param modelPath - Optional custom path to model directory.
 *                    Defaults to "./models/m2v-base-output" relative to current page.
 */
export async function initBrowser(modelPath?: string): Promise<void> {
  if (!isBrowser()) {
    console.warn("initBrowser() called in non-browser environment");
    return;
  }

  const fullModelPath = modelPath ?? DEFAULT_MODEL_PATH;
  await initBrowserEmbeddings(fullModelPath);
}

/**
 * Demo-friendly merge function with progress reporting.
 */
export interface MergeProgress {
  stage: "segmenting" | "embedding" | "aligning" | "merging" | "done";
  progress: number; // 0-100
  message: string;
}

export type ProgressCallback = (progress: MergeProgress) => void;

/**
 * Merge with progress reporting (useful for UI).
 */
export async function mergeWithProgress(
  baseV1: string,
  baseV2: string,
  userCustom: string,
  onProgress?: ProgressCallback,
  options?: import("./types/index.js").MergeOptions
): Promise<import("./types/index.js").MergeResult> {
  const report = (
    stage: MergeProgress["stage"],
    progress: number,
    message: string
  ): void => {
    onProgress?.({ stage, progress, message });
  };

  report("segmenting", 0, "Segmenting texts...");

  const { segment } = await import("./segmentation/index.js");
  const segV1 = segment(baseV1);
  const segV2 = segment(baseV2);
  const segUser = segment(userCustom);

  report(
    "segmenting",
    20,
    `Found ${segV1.units.length + segV2.units.length + segUser.units.length} segments`
  );

  report("embedding", 30, "Computing embeddings...");

  // Embeddings are computed lazily during alignment

  report("aligning", 50, "Aligning segments...");

  report("merging", 70, "Merging texts...");

  const { merge } = await import("./merge/index.js");
  const result = await merge(baseV1, baseV2, userCustom, options);

  report("done", 100, `Merge complete: ${result.stats.conflicts} conflicts`);

  return result;
}

/**
 * Simple diff for displaying changes in UI.
 */
export interface SimpleDiff {
  type: "added" | "removed" | "unchanged" | "modified";
  content: string;
  oldContent?: string;
}

/**
 * Generate a simplified diff for UI display.
 * Uses word-level diff by default for finer granularity.
 */
export async function getSimpleDiff(
  original: string,
  modified: string
): Promise<SimpleDiff[]> {
  const { wordDiff } = await import("./diff/index.js");

  // Use word-level diff for fine-grained changes
  const ops = wordDiff(original, modified);

  const diffs: SimpleDiff[] = [];

  for (const op of ops) {
    switch (op.type) {
      case "keep":
        diffs.push({ type: "unchanged", content: op.content });
        break;
      case "insert":
        diffs.push({ type: "added", content: op.content });
        break;
      case "delete":
        diffs.push({ type: "removed", content: op.content });
        break;
      case "replace":
        if (op.oldContent) {
          diffs.push({
            type: "modified",
            content: op.content,
            oldContent: op.oldContent,
          });
        } else {
          diffs.push({ type: "added", content: op.content });
        }
        break;
    }
  }

  return diffs;
}
