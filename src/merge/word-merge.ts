/**
 * Word-level 3-way merge.
 *
 * When sentence-level detects both sides changed,
 * drill down to word level to find minimal conflicts.
 *
 * A = original/ancestor
 * B = new/upgraded
 * C = user's customized version
 */

export interface WordMergeResult {
  merged: string;
  hasConflict: boolean;
  conflictRanges: Array<{
    start: number;
    end: number;
    b: string;
    c: string;
  }>;
}

/**
 * Tokenize text into words, preserving whitespace.
 */
function tokenize(text: string): string[] {
  // Split on word boundaries, keeping whitespace as separate tokens
  const tokens: string[] = [];
  let current = "";
  let inWord = false;

  for (const char of text) {
    const isWordChar = /\w/.test(char);

    if (isWordChar && !inWord) {
      // Starting a word
      if (current) tokens.push(current);
      current = char;
      inWord = true;
    } else if (!isWordChar && inWord) {
      // Ending a word
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
 * Compute longest common subsequence for word arrays.
 */
function lcs(a: string[], b: string[]): string[] {
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

  // Backtrack to find LCS
  const result: string[] = [];
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
 * Compute diff between two word arrays.
 */
interface DiffOp {
  type: "keep" | "delete" | "insert";
  tokens: string[];
}

function diff2(original: string[], modified: string[]): DiffOp[] {
  const common = lcs(original, modified);
  const ops: DiffOp[] = [];

  let oi = 0,
    mi = 0,
    ci = 0;

  while (oi < original.length || mi < modified.length) {
    // Collect deletions (in original but not in common)
    const deletions: string[] = [];
    while (oi < original.length && (ci >= common.length || original[oi] !== common[ci])) {
      deletions.push(original[oi]!);
      oi++;
    }
    if (deletions.length > 0) {
      ops.push({ type: "delete", tokens: deletions });
    }

    // Collect insertions (in modified but not in common)
    const insertions: string[] = [];
    while (mi < modified.length && (ci >= common.length || modified[mi] !== common[ci])) {
      insertions.push(modified[mi]!);
      mi++;
    }
    if (insertions.length > 0) {
      ops.push({ type: "insert", tokens: insertions });
    }

    // Keep common element
    if (ci < common.length) {
      ops.push({ type: "keep", tokens: [common[ci]!] });
      oi++;
      mi++;
      ci++;
    }
  }

  return ops;
}

/**
 * Perform 3-way word-level merge.
 *
 * This uses a proper 3-way merge algorithm:
 * 1. Compute diff from A to B (B changes)
 * 2. Compute diff from A to C (C changes)
 * 3. Walk through both diffs in parallel, processing operations
 * 4. Merge non-overlapping changes, flag conflicts for overlapping ones
 *
 * @param a - Original/ancestor text
 * @param b - New/upgraded text
 * @param c - User's customized text
 * @returns Merged result with minimal conflicts
 */
export function wordMerge3Way(a: string, b: string, c: string): WordMergeResult {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const tokensC = tokenize(c);

  // Get diffs from A perspective
  const abDiff = diff2(tokensA, tokensB);
  const acDiff = diff2(tokensA, tokensC);

  // Build maps from A positions to changes
  interface ChangeInfo {
    deleted: boolean;
    insertionBefore?: string[];
    insertionAfter?: string[];
  }

  const bChanges = new Map<number, ChangeInfo>();
  const cChanges = new Map<number, ChangeInfo>();

  // Track insertions before the first token
  let bInsertionAtStart: string[] = [];
  let cInsertionAtStart: string[] = [];

  // Process A→B diff to extract per-position changes
  let aIdx = 0;
  for (const op of abDiff) {
    if (op.type === "insert") {
      if (aIdx === 0 && bChanges.size === 0) {
        bInsertionAtStart = op.tokens;
      } else if (aIdx > 0) {
        const prevChange = bChanges.get(aIdx - 1) ?? { deleted: false };
        prevChange.insertionAfter = op.tokens;
        bChanges.set(aIdx - 1, prevChange);
      }
    } else if (op.type === "delete") {
      for (let j = 0; j < op.tokens.length; j++) {
        bChanges.set(aIdx, { deleted: true });
        aIdx++;
      }
    } else if (op.type === "keep") {
      aIdx += op.tokens.length;
    }
  }

  // Process A→C diff to extract per-position changes
  aIdx = 0;
  for (const op of acDiff) {
    if (op.type === "insert") {
      if (aIdx === 0 && cChanges.size === 0) {
        cInsertionAtStart = op.tokens;
      } else if (aIdx > 0) {
        const prevChange = cChanges.get(aIdx - 1) ?? { deleted: false };
        prevChange.insertionAfter = op.tokens;
        cChanges.set(aIdx - 1, prevChange);
      }
    } else if (op.type === "delete") {
      for (let j = 0; j < op.tokens.length; j++) {
        cChanges.set(aIdx, { deleted: true });
        aIdx++;
      }
    } else if (op.type === "keep") {
      aIdx += op.tokens.length;
    }
  }

  // Build merged result
  const merged: string[] = [];
  const conflictRanges: WordMergeResult["conflictRanges"] = [];
  let hasConflict = false;

  // Handle insertions at start
  if (bInsertionAtStart.length > 0 || cInsertionAtStart.length > 0) {
    // Both inserted at start - take both (B first, then C)
    merged.push(...bInsertionAtStart);
    merged.push(...cInsertionAtStart);
  }

  // Process each A token
  for (let i = 0; i < tokensA.length; i++) {
    const aToken = tokensA[i]!;
    const bChange = bChanges.get(i);
    const cChange = cChanges.get(i);

    const bDeleted = bChange?.deleted ?? false;
    const cDeleted = cChange?.deleted ?? false;

    if (!bDeleted && !cDeleted) {
      // Neither side deleted - keep the token
      merged.push(aToken);
    } else if (bDeleted && !cDeleted) {
      // B deleted, C kept - respect B deletion (upgrade takes priority)
      // Don't add the token
    } else if (!bDeleted && cDeleted) {
      // C deleted, B kept - respect C deletion
      // Don't add the token
    } else {
      // Both deleted - both want it gone, no conflict
      // Don't add the token
    }

    // Handle insertions after this position
    const bInsertAfter = bChange?.insertionAfter ?? [];
    const cInsertAfter = cChange?.insertionAfter ?? [];

    if (bInsertAfter.length > 0 || cInsertAfter.length > 0) {
      // Check if insertions conflict (same position, different content)
      if (
        bInsertAfter.length > 0 &&
        cInsertAfter.length > 0 &&
        bInsertAfter.join("") !== cInsertAfter.join("")
      ) {
        // Both inserted different content at same position - conflict
        hasConflict = true;
        const start = merged.length;
        const bContent = bInsertAfter.join("");
        const cContent = cInsertAfter.join("");
        merged.push(`<<<${bContent}|${cContent}>>>`);
        conflictRanges.push({
          start,
          end: start + 1,
          b: bContent,
          c: cContent,
        });
      } else {
        // Non-conflicting insertions - add both
        merged.push(...bInsertAfter);
        merged.push(...cInsertAfter);
      }
    }
  }

  return {
    merged: merged.join(""),
    hasConflict,
    conflictRanges,
  };
}

/**
 * Check if two sentences differ only in non-overlapping words.
 * If so, they can be merged without conflict.
 */
export function canMergeWithoutConflict(a: string, b: string, c: string): boolean {
  const result = wordMerge3Way(a, b, c);
  return !result.hasConflict;
}
