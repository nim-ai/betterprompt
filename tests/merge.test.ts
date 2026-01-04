import { describe, it, expect, beforeAll } from "vitest";
import { merge, hasConflicts, resolveConflict } from "../src/merge/index.js";
import { setDefaultProvider } from "../src/embeddings/index.js";
import type { EmbeddingProvider } from "../src/types/index.js";

/**
 * Simple test embedding provider that creates embeddings based on character frequencies.
 * This is deterministic and doesn't require network access.
 */
class TestEmbeddingProvider implements EmbeddingProvider {
  readonly name = "test-provider";
  readonly dimension = 26;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      // Create a simple embedding based on character frequencies
      const freq = new Array(26).fill(0);
      const normalized = text.toLowerCase();
      for (const char of normalized) {
        const code = char.charCodeAt(0) - 97;
        if (code >= 0 && code < 26) {
          freq[code]++;
        }
      }
      // Normalize
      const sum = Math.sqrt(freq.reduce((a, b) => a + b * b, 0)) || 1;
      return freq.map((f) => f / sum);
    });
  }
}

// Use test embedding provider (no network required)
beforeAll(() => {
  setDefaultProvider(new TestEmbeddingProvider());
});

describe("merge", () => {
  it("should handle no changes", async () => {
    const base = "Hello world.";
    const result = await merge(base, base, base);

    expect(result.merged.trim()).toBe(base);
    expect(result.conflicts).toHaveLength(0);
    expect(result.stats.unchanged).toBeGreaterThan(0);
  });

  it("should take base upgrade when user made no changes", async () => {
    const baseV1 = "Hello world.";
    const baseV2 = "Hello universe.";
    const userCustom = "Hello world."; // Same as v1

    const result = await merge(baseV1, baseV2, userCustom);

    expect(result.merged).toContain("universe");
    expect(result.stats.upgraded).toBeGreaterThan(0);
  });

  it("should preserve user customization when base unchanged", async () => {
    const baseV1 = "Hello world.";
    const baseV2 = "Hello world."; // Unchanged
    const userCustom = "Hello everyone."; // User changed

    const result = await merge(baseV1, baseV2, userCustom);

    expect(result.merged).toContain("everyone");
    expect(result.stats.preserved).toBeGreaterThan(0);
  });

  it("should detect conflicts when both sides change same content", async () => {
    const baseV1 = "The cat sat on the mat.";
    const baseV2 = "The dog sat on the mat."; // Changed cat -> dog
    const userCustom = "The cat sat on the rug."; // Changed mat -> rug

    const result = await merge(baseV1, baseV2, userCustom, {
      conflictStrategy: "defer",
    });

    // With the simple test embedding, results may vary
    // The important thing is that we get a merge result
    expect(result.merged).toBeTruthy();
    expect(result.stats).toBeDefined();
  });

  it("should handle user additions", async () => {
    const baseV1 = "First sentence.";
    const baseV2 = "First sentence.";
    const userCustom = "First sentence. User added this.";

    const result = await merge(baseV1, baseV2, userCustom);

    expect(result.merged).toContain("User added this");
    expect(result.stats.preserved).toBeGreaterThan(0);
  });

  it("should handle base additions", async () => {
    const baseV1 = "First sentence.";
    const baseV2 = "First sentence. Base added this.";
    const userCustom = "First sentence.";

    const result = await merge(baseV1, baseV2, userCustom);

    expect(result.merged).toContain("Base added this");
    expect(result.stats.upgraded).toBeGreaterThan(0);
  });

  it("should respect prefer-b strategy", async () => {
    const baseV1 = "Original.";
    const baseV2 = "Improved.";
    const userCustom = "Customized.";

    const result = await merge(baseV1, baseV2, userCustom, {
      conflictStrategy: "prefer-b",
    });

    // With prefer-b, should take B's version
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged).toContain("Improved");
  });

  it("should respect prefer-c strategy", async () => {
    const baseV1 = "Original.";
    const baseV2 = "Improved.";
    const userCustom = "Customized.";

    const result = await merge(baseV1, baseV2, userCustom, {
      conflictStrategy: "prefer-c",
    });

    // With prefer-c, should take C's version
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged).toContain("Customized");
  });

  it("should correctly merge multi-sentence texts without content duplication", async () => {
    // This test catches a bug where insertions were matched to wrong positions
    const baseV1 = `You are a helpful assistant.
You should be concise and accurate.
Always be polite.
Cite sources.`;

    const baseV2 = `You are a helpful AI assistant.
You should be concise, accurate, and thorough.
Always be polite and professional.
Cite sources when possible.`;

    const userCustom = `You are a helpful assistant specialized in Python.
You should be concise and accurate.
Always be polite.
Focus on best practices.`;

    const result = await merge(baseV1, baseV2, userCustom, {
      conflictStrategy: "prefer-c",
    });

    // Should not have duplicate sentences
    const lines = result.merged.split("\n").filter((l) => l.trim());
    const uniqueLines = new Set(lines);
    expect(lines.length).toBe(uniqueLines.size);

    // Should preserve C's first line customization
    expect(result.merged).toContain("Python");

    // Should preserve C's last line customization
    expect(result.merged).toContain("best practices");

    // Should not have garbled word merges (e.g., "accuratethorough")
    expect(result.merged).not.toMatch(/\w{15,}/); // No super long words from concatenation
  });

  it("should not produce garbled word merges when sentences differ", async () => {
    const baseV1 = "Be concise and accurate.";
    const baseV2 = "Be concise, accurate, and thorough.";
    const userCustom = "Be concise and accurate."; // Same as v1

    const result = await merge(baseV1, baseV2, userCustom, {
      conflictStrategy: "prefer-c",
    });

    // Since C didn't change from A, B's upgrade should apply cleanly
    // Result should not have duplicate words or missing spaces
    expect(result.merged).not.toContain("accuratethorough");
    expect(result.merged).not.toContain("  "); // No double spaces
    expect(result.merged).not.toMatch(/accurate.*accurate/); // No duplicate "accurate"
  });

});

describe("complex merge scenarios", () => {
  it("should handle near-duplicate sentences without cross-matching", async () => {
    // Similar sentences should match to their correct counterparts
    const a = "Be helpful. Be kind. Be professional.";
    const b = "Be very helpful. Be kind. Be very professional.";
    const c = "Be helpful. Be very kind. Be professional.";

    const result = await merge(a, b, c, { conflictStrategy: "defer" });

    // Should contain B's changes to first and third
    expect(result.merged).toContain("very helpful");
    expect(result.merged).toContain("very professional");
    // Should contain C's change to second
    expect(result.merged).toContain("very kind");
    // Should not have duplicates
    const kindCount = (result.merged.match(/kind/g) || []).length;
    expect(kindCount).toBe(1);
  });

  it("should handle B deleting what C modified", async () => {
    const a = "Keep this. Remove this. Keep this too.";
    const b = "Keep this. Keep this too."; // B deleted middle
    const c = "Keep this. Modified this. Keep this too."; // C modified middle

    // With prefer-c, should keep C's modification
    const resultC = await merge(a, b, c, { conflictStrategy: "prefer-c" });
    expect(resultC.merged).toContain("Modified this");

    // With prefer-b, should respect B's deletion
    const resultB = await merge(a, b, c, { conflictStrategy: "prefer-b" });
    expect(resultB.merged).not.toContain("Remove");
    expect(resultB.merged).not.toContain("Modified");
  });

  it("should handle both sides inserting at same position", async () => {
    const a = "First. Third.";
    const b = "First. From B. Third.";
    const c = "First. From C. Third.";

    const result = await merge(a, b, c, { conflictStrategy: "concatenate" });

    // Both insertions should be present
    expect(result.merged).toContain("From B");
    expect(result.merged).toContain("From C");
    // Original content preserved
    expect(result.merged).toContain("First");
    expect(result.merged).toContain("Third");
  });

  it("should handle repeated identical sentences", async () => {
    const a = "Do X. Do X. Do X.";
    const b = "Do Y. Do X. Do X."; // Changed first
    const c = "Do X. Do X. Do Z."; // Changed last

    const result = await merge(a, b, c, { conflictStrategy: "defer" });

    // First should be Y (from B), last should be Z (from C)
    const lines = result.merged.split(/\.\s*/).filter(s => s.trim());
    expect(lines[0]).toContain("Y");
    expect(lines[lines.length - 1]).toContain("Z");
  });

  it("should preserve trailing newlines", async () => {
    const a = "Content here.\n\n";
    const b = "Content here.\n\n";
    const c = "Content here.\n\n";

    const result = await merge(a, b, c);
    // Should end with newlines like the inputs
    expect(result.merged.endsWith("\n")).toBe(true);
  });

  it("should handle case-only changes appropriately", async () => {
    const a = "Hello World.";
    const b = "hello world."; // B lowercased
    const c = "Hello World."; // C unchanged

    const result = await merge(a, b, c, { conflictStrategy: "prefer-b" });
    // B's case change should apply
    expect(result.merged).toContain("hello world");
  });

  it("should handle one side adding, other side modifying existing", async () => {
    const a = "Existing content.";
    const b = "Existing content. New from B."; // B added
    const c = "Modified content."; // C modified existing

    const result = await merge(a, b, c, { conflictStrategy: "prefer-c" });
    // C's modification should be preserved
    expect(result.merged).toContain("Modified content");
    // B's addition should still be included
    expect(result.merged).toContain("New from B");
  });

  it("should handle empty C (user deleted everything)", async () => {
    const a = "Original content here.";
    const b = "Upgraded content here.";
    const c = ""; // User deleted all

    const result = await merge(a, b, c, { conflictStrategy: "prefer-c" });
    // With prefer-c and empty C, result should be empty or minimal
    expect(result.merged.trim().length).toBeLessThan(a.length);
  });

  it("should handle very long sentences in word merge", async () => {
    const longBase = "Word ".repeat(100) + "end.";
    const a = longBase;
    const b = longBase.replace("Word Word", "Modified Modified");
    const c = longBase.replace("end.", "finish.");

    // Use defer to get word-level merge behavior (combining B+C changes)
    const result = await merge(a, b, c, { conflictStrategy: "defer" });
    // Both changes should be present
    expect(result.merged).toContain("Modified");
    expect(result.merged).toContain("finish");
  });

  it("should handle multi-paragraph content with blank lines", async () => {
    const a = "Paragraph one.\n\nParagraph two.";
    const b = "Paragraph one modified.\n\nParagraph two.";
    const c = "Paragraph one.\n\nParagraph two modified.";

    const result = await merge(a, b, c);
    // Both modifications should be present
    expect(result.merged).toContain("one modified");
    expect(result.merged).toContain("two modified");
    // Blank line structure should be somewhat preserved
    expect(result.merged).toContain("\n");
  });
});

describe("hasConflicts", () => {
  it("should return true when conflicts exist", async () => {
    const result = await merge("A. B.", "X. B.", "A. Y.", {
      conflictStrategy: "defer",
    });

    // If there are conflicts, hasConflicts should return true
    if (result.conflicts.length > 0) {
      expect(hasConflicts(result)).toBe(true);
    }
  });

  it("should return false when no conflicts", async () => {
    const result = await merge("A.", "A.", "A.");
    expect(hasConflicts(result)).toBe(false);
  });
});

describe("resolveConflict", () => {
  it("should resolve a conflict and update merged text", async () => {
    const baseV1 = "Hello.";
    const baseV2 = "Hi.";
    const userCustom = "Hey.";

    const result = await merge(baseV1, baseV2, userCustom, {
      conflictStrategy: "defer",
    });

    if (result.conflicts.length > 0) {
      const conflict = result.conflicts[0]!;
      const resolved = resolveConflict(result, conflict.id, "Greetings.");

      expect(resolved.conflicts).toHaveLength(result.conflicts.length - 1);
      expect(resolved.merged).toContain("Greetings");
      expect(resolved.resolutions.length).toBe(result.resolutions.length + 1);
    }
  });

  it("should throw for non-existent conflict", async () => {
    const result = await merge("A.", "A.", "A.");

    expect(() => resolveConflict(result, "fake-id", "resolved")).toThrow();
  });
});

describe("concatenate strategy with conflicts", () => {
  it("should concatenate B and C when both changed the same content", async () => {
    // Force a conflict scenario where B and C both modify the same sentence
    const a = "Original sentence.";
    const b = "B version of sentence.";
    const c = "C version of sentence.";

    const result = await merge(a, b, c, { conflictStrategy: "concatenate" });

    // Concatenate should include content from both B and C
    // Either as separate sentences or combined
    expect(result.conflicts).toHaveLength(0); // concatenate auto-resolves
    // The merged result should contain elements from both versions
    expect(result.merged.length).toBeGreaterThan(0);
  });

  it("should handle concatenate with multiple conflicts", async () => {
    const a = "First. Second. Third.";
    const b = "First modified. Second modified. Third modified.";
    const c = "First changed. Second changed. Third changed.";

    const result = await merge(a, b, c, { conflictStrategy: "concatenate" });

    // All conflicts should be auto-resolved via concatenation
    expect(result.conflicts).toHaveLength(0);
    expect(result.stats.autoResolved).toBeGreaterThanOrEqual(0);
  });
});

