/**
 * Tests for word-level 3-way merge.
 */

import { describe, it, expect } from "vitest";
import {
  wordMerge3Way,
  canMergeWithoutConflict,
} from "../src/merge/word-merge.js";

describe("wordMerge3Way", () => {
  describe("no changes", () => {
    it("returns unchanged text when all versions are identical", () => {
      const text = "The quick brown fox";
      const result = wordMerge3Way(text, text, text);

      expect(result.merged).toBe(text);
      expect(result.hasConflict).toBe(false);
      expect(result.conflictRanges).toHaveLength(0);
    });
  });

  describe("single-sided changes", () => {
    it("takes base changes when user did not change", () => {
      const baseV1 = "The quick brown fox";
      const baseV2 = "The fast brown fox"; // changed "quick" to "fast"
      const user = "The quick brown fox"; // unchanged

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("The fast brown fox");
      expect(result.hasConflict).toBe(false);
    });

    it("takes user changes when base did not change", () => {
      const baseV1 = "The quick brown fox";
      const baseV2 = "The quick brown fox"; // unchanged
      const user = "The quick red fox"; // changed "brown" to "red"

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("The quick red fox");
      expect(result.hasConflict).toBe(false);
    });
  });

  describe("non-overlapping changes", () => {
    it("merges changes to different words without conflict", () => {
      const baseV1 = "The quick brown fox";
      const baseV2 = "The fast brown fox"; // changed "quick" to "fast"
      const user = "The quick red fox"; // changed "brown" to "red"

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("The fast red fox");
      expect(result.hasConflict).toBe(false);
    });

    it("merges changes at beginning and end", () => {
      const baseV1 = "Hello world today";
      const baseV2 = "Hi world today"; // changed "Hello" to "Hi"
      const user = "Hello world tonight"; // changed "today" to "tonight"

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("Hi world tonight");
      expect(result.hasConflict).toBe(false);
    });

    it("handles multiple non-overlapping changes", () => {
      const baseV1 = "one two three four five";
      const baseV2 = "ONE two THREE four five"; // changed 1st and 3rd
      const user = "one TWO three four FIVE"; // changed 2nd and 5th

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("ONE TWO THREE four FIVE");
      expect(result.hasConflict).toBe(false);
    });
  });

  describe("overlapping changes (conflicts)", () => {
    it("detects conflict when both change same word", () => {
      const baseV1 = "The quick brown fox";
      const baseV2 = "The fast brown fox"; // changed "quick" to "fast"
      const user = "The slow brown fox"; // changed "quick" to "slow"

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictRanges.length).toBeGreaterThan(0);
    });

    it("reports conflict ranges correctly", () => {
      const baseV1 = "The quick brown fox";
      const baseV2 = "The fast brown fox";
      const user = "The slow brown fox";

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.conflictRanges[0]).toMatchObject({
        b: "fast",
        c: "slow",
      });
    });
  });

  describe("insertions", () => {
    it("handles base insertions", () => {
      const baseV1 = "quick fox";
      const baseV2 = "quick brown fox"; // inserted "brown"
      const user = "quick fox"; // unchanged

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("quick brown fox");
      expect(result.hasConflict).toBe(false);
    });

    it("handles user insertions", () => {
      const baseV1 = "quick fox";
      const baseV2 = "quick fox"; // unchanged
      const user = "quick lazy fox"; // inserted "lazy"

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("quick lazy fox");
      expect(result.hasConflict).toBe(false);
    });
  });

  describe("deletions", () => {
    it("handles base deletions", () => {
      const baseV1 = "quick brown fox";
      const baseV2 = "quick fox"; // deleted "brown"
      const user = "quick brown fox"; // unchanged

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("quick fox");
      expect(result.hasConflict).toBe(false);
    });

    it("handles user deletions", () => {
      const baseV1 = "quick brown fox";
      const baseV2 = "quick brown fox"; // unchanged
      const user = "quick fox"; // deleted "brown"

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("quick fox");
      expect(result.hasConflict).toBe(false);
    });
  });

  describe("whitespace preservation", () => {
    it("preserves whitespace between words", () => {
      const baseV1 = "hello  world"; // double space
      const baseV2 = "hello  world";
      const user = "hello  world";

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("hello  world");
    });

    it("preserves leading whitespace", () => {
      const baseV1 = "  hello";
      const baseV2 = "  hello";
      const user = "  hello";

      const result = wordMerge3Way(baseV1, baseV2, user);

      expect(result.merged).toBe("  hello");
    });
  });
});

describe("canMergeWithoutConflict", () => {
  it("returns true for non-conflicting changes", () => {
    const baseV1 = "The quick brown fox";
    const baseV2 = "The fast brown fox";
    const user = "The quick red fox";

    expect(canMergeWithoutConflict(baseV1, baseV2, user)).toBe(true);
  });

  it("returns false for conflicting changes", () => {
    const baseV1 = "The quick brown fox";
    const baseV2 = "The fast brown fox";
    const user = "The slow brown fox";

    expect(canMergeWithoutConflict(baseV1, baseV2, user)).toBe(false);
  });
});
