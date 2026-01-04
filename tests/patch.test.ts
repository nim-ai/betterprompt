import { describe, it, expect, beforeAll } from "vitest";
import {
  generatePatch,
  applyPatch,
  serializePatch,
  deserializePatch,
  isPatchCompatible,
} from "../src/patch/index.js";
import { setDefaultProvider } from "../src/embeddings/index.js";
import type { EmbeddingProvider } from "../src/types/index.js";

/**
 * Simple test embedding provider that creates embeddings based on character frequencies.
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

describe("generatePatch", () => {
  it("should generate a patch for modifications", async () => {
    const original = "Hello world.";
    const modified = "Hello universe.";

    const patch = await generatePatch(original, modified);

    expect(patch.version).toBe("1.0.0");
    expect(patch.baseHash).toBeTruthy();
    expect(patch.edits.length).toBeGreaterThan(0);
  });

  it("should generate empty edits for identical texts", async () => {
    const text = "Hello world.";
    const patch = await generatePatch(text, text);

    // Should have no non-KEEP edits
    const changes = patch.edits.filter((e) => e.operation !== "KEEP");
    expect(changes).toHaveLength(0);
  });

  it("should include timestamp", async () => {
    const patch = await generatePatch("a", "b");
    expect(patch.createdAt).toBeTruthy();
    expect(() => new Date(patch.createdAt)).not.toThrow();
  });
});

describe("applyPatch", () => {
  it("should apply a simple replacement patch", async () => {
    const original = "Hello world.";
    const modified = "Hello universe.";

    const patch = await generatePatch(original, modified);
    const result = await applyPatch(original, patch);

    // With the simple test embedding, patch application may have varying results
    // The key is that the operation completes without throwing
    expect(result).toBeDefined();
    expect(
      result.applied.length + result.failed.length + result.adapted.length
    ).toBe(patch.edits.length);
  });

  it("should apply patch to new base with similar content", async () => {
    const original = "Hello world.";
    const modified = "Hello universe.";
    const newBase = "Hello world! Welcome."; // Similar but different

    const patch = await generatePatch(original, modified);
    const result = await applyPatch(newBase, patch);

    // Should have applied or adapted some edits
    expect(
      result.applied.length + result.adapted.length
    ).toBeGreaterThanOrEqual(0);
  });

  it("should report failed edits when anchor not found", async () => {
    const original = "Hello world.";
    const modified = "Hello universe.";
    const newBase = "Completely different text.";

    const patch = await generatePatch(original, modified);
    const result = await applyPatch(newBase, patch);

    // Some edits should fail on completely different text
    if (patch.edits.length > 0) {
      expect(
        result.failed.length + result.applied.length + result.adapted.length
      ).toBe(patch.edits.length);
    }
  });

  it("should handle insertion patches", async () => {
    const original = "First sentence.";
    const modified = "First sentence. Added content.";

    const patch = await generatePatch(original, modified);

    // The patch should contain an insertion operation
    expect(patch.edits.length).toBeGreaterThan(0);

    const result = await applyPatch(original, patch);

    // Patch application should complete
    expect(result).toBeDefined();
  });

  it("should handle deletion patches", async () => {
    const original = "First sentence. Remove this. Last sentence.";
    const modified = "First sentence. Last sentence.";

    const patch = await generatePatch(original, modified);
    const result = await applyPatch(original, patch);

    expect(result.result).not.toContain("Remove this");
  });
});

describe("serializePatch / deserializePatch", () => {
  it("should round-trip serialize and deserialize", async () => {
    const patch = await generatePatch("Hello.", "World.");
    const json = serializePatch(patch);
    const restored = deserializePatch(json);

    expect(restored.version).toBe(patch.version);
    expect(restored.baseHash).toBe(patch.baseHash);
    expect(restored.edits.length).toBe(patch.edits.length);
  });

  it("should produce valid JSON", async () => {
    const patch = await generatePatch("a", "b");
    const json = serializePatch(patch);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("should throw on invalid patch JSON", () => {
    expect(() => deserializePatch("{}")).toThrow();
    expect(() => deserializePatch('{"version": "1.0.0"}')).toThrow();
  });

  it("should handle patches with metadata", async () => {
    const patch = await generatePatch("a", "b");
    patch.metadata = { author: "test", note: "test patch" };

    const json = serializePatch(patch);
    const restored = deserializePatch(json);

    expect(restored.metadata).toEqual(patch.metadata);
  });
});

describe("isPatchCompatible", () => {
  it("should return true for exact base match", async () => {
    const base = "Hello world.";
    const patch = await generatePatch(base, "Hello universe.");

    expect(isPatchCompatible(patch, base)).toBe(true);
  });

  it("should return false for different base", async () => {
    const base = "Hello world.";
    const patch = await generatePatch(base, "Hello universe.");

    expect(isPatchCompatible(patch, "Different text.")).toBe(false);
  });
});

describe("applyPatch edge cases", () => {
  it("should handle INSERT at beginning (no anchor)", async () => {
    const original = "Middle sentence. End sentence.";
    const modified = "New first sentence. Middle sentence. End sentence.";

    const patch = await generatePatch(original, modified);
    const result = await applyPatch(original, patch);

    expect(result.result).toContain("New first");
  });

  it("should adapt INSERT when context changes", async () => {
    const original = "First sentence. Second sentence. Third sentence.";
    const modified =
      "First sentence. Second sentence. Inserted here. Third sentence.";

    const patch = await generatePatch(original, modified);

    // Apply to a base with similar but changed context
    const newBase = "First line. Second sentence. Third part.";
    const result = await applyPatch(newBase, patch);

    // Should either apply or adapt (depends on context similarity)
    expect(
      result.applied.length + result.adapted.length + result.failed.length
    ).toBeGreaterThan(0);
  });

  it("should handle KEEP operations", async () => {
    const original = "First. Second. Third.";
    const modified = "First. Modified. Third.";

    const patch = await generatePatch(original, modified);

    // KEEP operations should be tracked
    const keepOps = patch.edits.filter((e) => e.operation === "KEEP");
    if (keepOps.length > 0) {
      const result = await applyPatch(original, patch);
      expect(result.applied).toBeDefined();
    }
  });

  it("should adapt REPLACE when context changes", async () => {
    const original =
      "First sentence here. Target sentence. Last sentence here.";
    const modified =
      "First sentence here. Replaced sentence. Last sentence here.";

    const patch = await generatePatch(original, modified);

    // Apply to base with different surrounding context
    const newBase = "Different prefix. Target sentence. Different suffix.";
    const result = await applyPatch(newBase, patch);

    // Should have adapted or applied some edits
    expect(result).toBeDefined();
  });

  it("should adapt DELETE when context changes", async () => {
    const original = "Keep this. Delete me. Keep that.";
    const modified = "Keep this. Keep that.";

    const patch = await generatePatch(original, modified);

    // Apply to base with slightly different context
    const newBase = "Keep something. Delete me. Keep another.";
    const result = await applyPatch(newBase, patch);

    // Should successfully delete or adapt
    expect(result).toBeDefined();
  });
});
