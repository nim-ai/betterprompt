/**
 * Tests that verify the behavior described in README.md
 *
 * These are the "golden" tests - if the algorithm doesn't produce
 * these results, something is wrong.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { merge } from "../src/merge/index.js";
import { setDefaultProvider } from "../src/embeddings/index.js";
import type { EmbeddingProvider } from "../src/types/index.js";

/**
 * Simple embedding provider for deterministic tests.
 */
class TestEmbeddingProvider implements EmbeddingProvider {
  readonly name = "test-provider";
  readonly dimension = 26;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const freq = new Array(26).fill(0);
      const normalized = text.toLowerCase();
      for (const char of normalized) {
        const code = char.charCodeAt(0) - 97;
        if (code >= 0 && code < 26) {
          freq[code]++;
        }
      }
      const sum = Math.sqrt(freq.reduce((a, b) => a + b * b, 0)) || 1;
      return freq.map((f) => f / sum);
    });
  }
}

beforeAll(() => {
  setDefaultProvider(new TestEmbeddingProvider());
});

describe("README example behavior", () => {
  /**
   * This is THE key test from the README:
   *
   * A (baseV1):    "You are a helpful assistant."
   * B (baseV2):    "You are a helpful AI assistant. Be concise."
   * C (userCustom): "You are a helpful assistant specialized in Python."
   *
   * Expected: "You are a helpful AI assistant specialized in Python. Be concise."
   *
   * The algorithm should:
   * 1. Notice B added "AI" before "assistant" -> apply upgrade
   * 2. Notice C added "specialized in Python" -> preserve customization
   * 3. Notice B added "Be concise." -> apply upgrade
   */
  it("should merge the README example correctly", async () => {
    const a = "You are a helpful assistant.";
    const b = "You are a helpful AI assistant. Be concise.";
    const c = "You are a helpful assistant specialized in Python.";

    // Use defer to get word-level merge behavior (combining B+C changes)
    const result = await merge(a, b, c, { conflictStrategy: "defer" });

    console.log("Merged result:", result.merged);
    console.log("Stats:", result.stats);
    console.log("Conflicts:", result.conflicts.length);

    // The merged result should contain all the improvements
    expect(result.merged).toContain("AI assistant");
    expect(result.merged).toContain("specialized in Python");
    expect(result.merged).toContain("Be concise");
    expect(result.conflicts).toHaveLength(0);
  });

  /**
   * Simple case: B makes a change, C doesn't change.
   * Result should be B's version.
   */
  it("should take B's changes when C is unchanged", async () => {
    const a = "Hello world.";
    const b = "Hello universe.";
    const c = "Hello world."; // Same as A

    const result = await merge(a, b, c);

    console.log("B-only change:", result.merged);

    expect(result.merged.trim()).toBe("Hello universe.");
    expect(result.stats.upgraded).toBeGreaterThan(0);
  });

  /**
   * Simple case: C makes a change, B doesn't change.
   * Result should be C's version.
   */
  it("should take C's changes when B is unchanged", async () => {
    const a = "Hello world.";
    const b = "Hello world."; // Same as A
    const c = "Hello everyone.";

    const result = await merge(a, b, c);

    console.log("C-only change:", result.merged);

    expect(result.merged.trim()).toBe("Hello everyone.");
    expect(result.stats.preserved).toBeGreaterThan(0);
  });

  /**
   * B and C make non-overlapping changes.
   * Both should be applied.
   */
  it("should apply non-overlapping changes from both B and C", async () => {
    const a = "First sentence. Second sentence.";
    const b = "First sentence improved. Second sentence.";
    const c = "First sentence. Second sentence improved.";

    const result = await merge(a, b, c);

    console.log("Non-overlapping:", result.merged);

    expect(result.merged).toContain("First sentence improved");
    expect(result.merged).toContain("Second sentence improved");
    expect(result.conflicts).toHaveLength(0);
  });

  /**
   * B adds content, C doesn't change.
   * Added content should appear.
   */
  it("should include content added by B", async () => {
    const a = "First sentence.";
    const b = "First sentence. New from B.";
    const c = "First sentence.";

    const result = await merge(a, b, c);

    console.log("B addition:", result.merged);

    expect(result.merged).toContain("New from B");
  });

  /**
   * C adds content, B doesn't change.
   * Added content should appear.
   */
  it("should include content added by C", async () => {
    const a = "First sentence.";
    const b = "First sentence.";
    const c = "First sentence. New from C.";

    const result = await merge(a, b, c);

    console.log("C addition:", result.merged);

    expect(result.merged).toContain("New from C");
  });

  /**
   * Both B and C add different content.
   * Both additions should appear.
   */
  it("should include additions from both B and C", async () => {
    const a = "Original.";
    const b = "Original. Added by B.";
    const c = "Original. Added by C.";

    const result = await merge(a, b, c);

    console.log("Both additions:", result.merged);

    expect(result.merged).toContain("Original");
    expect(result.merged).toContain("Added by B");
    expect(result.merged).toContain("Added by C");
  });
});

describe("Word-level merge behavior", () => {
  /**
   * B and C change different words in the same sentence.
   * Word-level merge should combine them without conflict.
   */
  it("should merge word-level changes without conflict", async () => {
    const a = "The quick brown fox jumps.";
    const b = "The fast brown fox jumps."; // quick -> fast
    const c = "The quick red fox jumps."; // brown -> red

    // Use defer to get word-level merge behavior (combining B+C changes)
    const result = await merge(a, b, c, { conflictStrategy: "defer" });

    console.log("Word-level merge:", result.merged);

    // Should have both changes
    expect(result.merged).toContain("fast");
    expect(result.merged).toContain("red");
    expect(result.conflicts).toHaveLength(0);
  });

  /**
   * B and C change the same word differently.
   * This is a true conflict.
   */
  it("should detect conflict when B and C change same word", async () => {
    const a = "The quick brown fox.";
    const b = "The fast brown fox."; // quick -> fast
    const c = "The slow brown fox."; // quick -> slow

    const result = await merge(a, b, c, { conflictStrategy: "defer" });

    console.log("Same word conflict:", result.merged);
    console.log("Conflicts:", result.conflicts);

    // Should have a conflict
    expect(result.conflicts.length).toBeGreaterThan(0);
  });
});

describe("Conflict resolution", () => {
  /**
   * When there's a conflict and we prefer B, take B's version.
   */
  it("should take B version when prefer-b strategy", async () => {
    const a = "Original text.";
    const b = "B's version.";
    const c = "C's version.";

    const result = await merge(a, b, c, { conflictStrategy: "prefer-b" });

    console.log("Prefer B:", result.merged);

    expect(result.merged).toContain("B's version");
    expect(result.conflicts).toHaveLength(0);
  });

  /**
   * When there's a conflict and we prefer C, take C's version.
   */
  it("should take C version when prefer-c strategy", async () => {
    const a = "Original text.";
    const b = "B's version.";
    const c = "C's version.";

    const result = await merge(a, b, c, { conflictStrategy: "prefer-c" });

    console.log("Prefer C:", result.merged);

    expect(result.merged).toContain("C's version");
    expect(result.conflicts).toHaveLength(0);
  });
});
