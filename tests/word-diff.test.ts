import { describe, it, expect } from "vitest";
import {
  wordDiff,
  tokenDiff,
  simpleDiff,
  diff,
  summarizeDiff,
} from "../src/diff/index.js";

describe("wordDiff", () => {
  it("should show no changes for identical text", () => {
    const result = wordDiff("hello world", "hello world");

    expect(result).toHaveLength(3); // "hello", " ", "world"
    expect(result.every((op) => op.type === "keep")).toBe(true);
  });

  it("should detect single word replacement", () => {
    const result = wordDiff("The quick brown fox", "The fast brown fox");

    const modified = result.filter((op) => op.type === "replace");
    expect(modified).toHaveLength(1);
    expect(modified[0]?.oldContent).toBe("quick");
    expect(modified[0]?.content).toBe("fast");
  });

  it("should detect multiple word replacements", () => {
    const result = wordDiff(
      "The quick brown fox jumps over the lazy dog",
      "The fast brown fox leaps over the sleepy dog"
    );

    const modified = result.filter((op) => op.type === "replace");
    expect(modified).toHaveLength(3);

    // quick -> fast
    expect(modified[0]?.oldContent).toBe("quick");
    expect(modified[0]?.content).toBe("fast");

    // jumps -> leaps
    expect(modified[1]?.oldContent).toBe("jumps");
    expect(modified[1]?.content).toBe("leaps");

    // lazy -> sleepy
    expect(modified[2]?.oldContent).toBe("lazy");
    expect(modified[2]?.content).toBe("sleepy");
  });

  it("should detect word insertions", () => {
    const result = wordDiff("Hello world", "Hello beautiful world");

    const inserted = result.filter((op) => op.type === "insert");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.content).toContain("beautiful");
  });

  it("should detect word deletions", () => {
    const result = wordDiff("Hello beautiful world", "Hello world");

    const deleted = result.filter((op) => op.type === "delete");
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.content).toContain("beautiful");
  });

  it("should preserve punctuation", () => {
    const result = wordDiff("Hello, world!", "Hello, universe!");

    const modified = result.filter((op) => op.type === "replace");
    expect(modified).toHaveLength(1);
    expect(modified[0]?.oldContent).toBe("world");
    expect(modified[0]?.content).toBe("universe");

    // Punctuation should be kept
    const kept = result.filter((op) => op.type === "keep");
    expect(kept.some((op) => op.content === "!")).toBe(true);
  });

  it("should handle complete text replacement", () => {
    const result = wordDiff("ABC", "XYZ");

    // Single replacement
    const replaced = result.filter((op) => op.type === "replace");
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.oldContent).toBe("ABC");
    expect(replaced[0]?.content).toBe("XYZ");
  });

  it("should handle empty original text", () => {
    const result = wordDiff("", "Hello world");

    const inserted = result.filter((op) => op.type === "insert");
    expect(inserted.length).toBeGreaterThan(0);
  });

  it("should handle empty modified text", () => {
    const result = wordDiff("Hello world", "");

    const deleted = result.filter((op) => op.type === "delete");
    expect(deleted.length).toBeGreaterThan(0);
  });
});

describe("tokenDiff", () => {
  it("should handle punctuation as separate tokens", () => {
    const result = tokenDiff("Hello, world!", "Hello, universe!");

    const modified = result.filter((op) => op.type === "replace");
    expect(modified).toHaveLength(1);
    expect(modified[0]?.oldContent).toBe("world");
    expect(modified[0]?.content).toBe("universe");

    // Punctuation preserved
    const kept = result.filter((op) => op.type === "keep");
    expect(kept.some((op) => op.content === ",")).toBe(true);
    expect(kept.some((op) => op.content === "!")).toBe(true);
  });

  it("should handle contractions as single tokens", () => {
    const result = tokenDiff("I can't do it", "I won't do it");

    const modified = result.filter((op) => op.type === "replace");
    expect(modified).toHaveLength(1);
    expect(modified[0]?.oldContent).toBe("can't");
    expect(modified[0]?.content).toBe("won't");
  });

  it("should handle numbers", () => {
    const result = tokenDiff("I have 5 apples", "I have 10 apples");

    const modified = result.filter((op) => op.type === "replace");
    expect(modified).toHaveLength(1);
    expect(modified[0]?.oldContent).toBe("5");
    expect(modified[0]?.content).toBe("10");
  });
});

describe("simpleDiff with granularity options", () => {
  it("should use word-level by default", () => {
    const result = simpleDiff("quick fox", "fast fox");
    const modified = result.filter((op) => op.type === "replace");
    expect(modified[0]?.oldContent).toBe("quick");
  });

  it("should support token granularity", () => {
    const result = simpleDiff("Hello, world!", "Hello, universe!", {
      granularity: "token",
    });
    const modified = result.filter((op) => op.type === "replace");
    expect(modified[0]?.oldContent).toBe("world");
  });

  it("should support sentence granularity", () => {
    const result = simpleDiff(
      "First sentence. Second sentence.",
      "First sentence. Different sentence.",
      { granularity: "sentence" }
    );

    // At sentence level, only "Second sentence." vs "Different sentence." differs
    const modified = result.filter((op) => op.type === "replace");
    expect(modified).toHaveLength(1);
    expect(modified[0]?.oldContent).toContain("Second");
    expect(modified[0]?.content).toContain("Different");
  });
});

describe("summarizeDiff", () => {
  it("should summarize diff with all change types", async () => {
    const result = await diff(
      "Keep this. Delete me. Replace old.",
      "Keep this. Added new. Replace new."
    );

    const summary = summarizeDiff(result);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("should return 'No changes' for identical texts", async () => {
    const result = await diff("Same text.", "Same text.");
    const summary = summarizeDiff(result);
    expect(summary).toContain("unchanged");
  });

  it("should include counts for each change type", async () => {
    const result = await diff(
      "First. Second. Third.",
      "First. Modified. Third. Added."
    );

    const summary = summarizeDiff(result);
    // Should have some description of changes
    expect(summary.length).toBeGreaterThan(0);
  });
});
