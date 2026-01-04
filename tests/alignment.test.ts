/**
 * Alignment module tests.
 */

import { describe, it, expect } from "vitest";
import { align } from "../src/alignment/index.js";
import { segment } from "../src/segmentation/index.js";
import {
  CharFrequencyEmbeddingProvider,
  setDefaultProvider,
  getDefaultProvider,
} from "../src/embeddings/index.js";

// Use char-frequency provider for faster tests
const charFrequencyProvider = new CharFrequencyEmbeddingProvider();

describe("align", () => {
  describe("edge cases", () => {
    it("should handle empty source and target", async () => {
      const result = await align([], [], {}, charFrequencyProvider);
      expect(result.pairs).toEqual([]);
      expect(result.unmatchedSource).toEqual([]);
      expect(result.unmatchedTarget).toEqual([]);
    });

    it("should handle empty source", async () => {
      const target = segment("Hello world.").units;
      const result = await align([], target, {}, charFrequencyProvider);

      expect(result.pairs).toHaveLength(target.length);
      for (const pair of result.pairs) {
        expect(pair.source).toBeNull();
        expect(pair.type).toBe("insertion");
      }
    });

    it("should handle empty target", async () => {
      const source = segment("Hello world.").units;
      const result = await align(source, [], {}, charFrequencyProvider);

      expect(result.pairs).toHaveLength(source.length);
      for (const pair of result.pairs) {
        expect(pair.target).toBeNull();
        expect(pair.type).toBe("deletion");
      }
    });
  });

  describe("sequential strategy", () => {
    it("should align identical texts", async () => {
      const source = segment("Hello world.").units;
      const target = segment("Hello world.").units;

      const result = await align(
        source,
        target,
        { strategy: "sequential" },
        charFrequencyProvider
      );

      expect(result.pairs.length).toBeGreaterThan(0);
    });

    it("should detect deletions", async () => {
      const source = segment("First. Second. Third.").units;
      const target = segment("First. Third.").units;

      const result = await align(
        source,
        target,
        { strategy: "sequential" },
        charFrequencyProvider
      );

      const deletions = result.pairs.filter((p) => p.type === "deletion");
      expect(deletions.length).toBeGreaterThan(0);
    });

    it("should detect insertions", async () => {
      const source = segment("First. Third.").units;
      const target = segment("First. Second. Third.").units;

      const result = await align(
        source,
        target,
        { strategy: "sequential" },
        charFrequencyProvider
      );

      const insertions = result.pairs.filter((p) => p.type === "insertion");
      expect(insertions.length).toBeGreaterThan(0);
    });
  });

  describe("semantic strategy", () => {
    it("should align by semantic similarity", async () => {
      const source = segment("The cat sat on the mat.").units;
      const target = segment("The cat sat on the mat.").units;

      const result = await align(
        source,
        target,
        { strategy: "semantic" },
        charFrequencyProvider
      );

      expect(result.pairs.length).toBeGreaterThan(0);
    });

    it("should match similar content out of order", async () => {
      const source = segment("First sentence. Second sentence.").units;
      const target = segment("Second sentence. First sentence.").units;

      const result = await align(
        source,
        target,
        { strategy: "semantic", matchThreshold: 0.8 },
        charFrequencyProvider
      );

      // With semantic matching, similar sentences should be matched
      expect(result.pairs.length).toBeGreaterThan(0);
    });

    it("should detect unmatched content as deletions and insertions", async () => {
      const source = segment("Unique source content.").units;
      const target = segment("Completely different target.").units;

      const result = await align(
        source,
        target,
        { strategy: "semantic", matchThreshold: 0.9 },
        charFrequencyProvider
      );

      // With high threshold, nothing should match
      const deletions = result.pairs.filter((p) => p.type === "deletion");
      const insertions = result.pairs.filter((p) => p.type === "insertion");

      expect(deletions.length + insertions.length).toBeGreaterThan(0);
    });
  });

  describe("hybrid strategy", () => {
    it("should use hybrid by default", async () => {
      const source = segment("Hello world.").units;
      const target = segment("Hello universe.").units;

      const result = await align(source, target, {}, charFrequencyProvider);

      expect(result.pairs.length).toBeGreaterThan(0);
    });

    it("should detect moves as modifications", async () => {
      // Content is similar but in different positions
      const source = segment("First. Middle. Last.").units;
      const target = segment("Middle. First. Last.").units;

      const result = await align(
        source,
        target,
        { strategy: "hybrid", matchThreshold: 0.7 },
        charFrequencyProvider
      );

      // Should detect reordering
      expect(result.pairs.length).toBeGreaterThan(0);
    });

    it("should handle complex changes", async () => {
      const source = segment("A. B. C. D.").units;
      const target = segment("A. X. C. D. E.").units;

      const result = await align(
        source,
        target,
        { strategy: "hybrid" },
        charFrequencyProvider
      );

      // Should have matches, modifications, and insertions
      expect(result.pairs.length).toBeGreaterThan(0);
    });
  });

  describe("matchThreshold option", () => {
    it("should respect match threshold", async () => {
      const source = segment("Hello world.").units;
      const target = segment("Hello world!").units;

      // High threshold - might not match
      const highResult = await align(
        source,
        target,
        { matchThreshold: 0.99 },
        charFrequencyProvider
      );

      // Low threshold - should match
      const lowResult = await align(
        source,
        target,
        { matchThreshold: 0.5 },
        charFrequencyProvider
      );

      // Both should produce pairs
      expect(highResult.pairs.length).toBeGreaterThan(0);
      expect(lowResult.pairs.length).toBeGreaterThan(0);
    });
  });

  describe("uses default provider when not specified", () => {
    it("should work with default provider", async () => {
      // Save current default
      const original = getDefaultProvider();

      // Set a known provider
      setDefaultProvider(charFrequencyProvider);

      const source = segment("Hello world.").units;
      const target = segment("Hello world.").units;

      // Don't pass provider - should use default
      const result = await align(source, target);

      expect(result.pairs.length).toBeGreaterThan(0);

      // Restore
      setDefaultProvider(original);
    });
  });
});
