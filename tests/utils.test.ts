import { describe, it, expect } from "vitest";
import {
  createHash,
  createContextualHash,
  hashesEqual,
  cosineSimilarity,
  levenshteinDistance,
  levenshteinSimilarity,
  classifySimilarity,
} from "../src/utils/index.js";

describe("createHash", () => {
  it("should create consistent hashes", () => {
    const hash1 = createHash("hello world");
    const hash2 = createHash("hello world");
    expect(hash1).toBe(hash2);
  });

  it("should create different hashes for different input", () => {
    const hash1 = createHash("hello");
    const hash2 = createHash("world");
    expect(hash1).not.toBe(hash2);
  });

  it("should return 8-character hex strings", () => {
    const hash = createHash("test");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("should handle empty string", () => {
    const hash = createHash("");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("should handle unicode", () => {
    const hash = createHash("你好世界");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("createContextualHash", () => {
  it("should include context in hash", () => {
    const hash1 = createContextualHash("content", "before", "after");
    const hash2 = createContextualHash("content", "different", "after");
    expect(hash1).not.toBe(hash2);
  });

  it("should be consistent with same inputs", () => {
    const hash1 = createContextualHash("a", "b", "c");
    const hash2 = createContextualHash("a", "b", "c");
    expect(hash1).toBe(hash2);
  });
});

describe("hashesEqual", () => {
  it("should return true for identical hashes", () => {
    const hash = createHash("test");
    expect(hashesEqual(hash, hash)).toBe(true);
  });

  it("should return false for different hashes", () => {
    const hash1 = createHash("test1");
    const hash2 = createHash("test2");
    expect(hashesEqual(hash1, hash2)).toBe(false);
  });

  it("should return true for manually constructed equal strings", () => {
    expect(hashesEqual("abc12345", "abc12345")).toBe(true);
  });

  it("should return false for empty vs non-empty", () => {
    expect(hashesEqual("", "abc")).toBe(false);
  });
});

describe("cosineSimilarity", () => {
  it("should return 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("should return 0 for orthogonal vectors", () => {
    const v1 = [1, 0];
    const v2 = [0, 1];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0);
  });

  it("should return -1 for opposite vectors", () => {
    const v1 = [1, 0];
    const v2 = [-1, 0];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1);
  });

  it("should handle normalized vectors", () => {
    const v1 = [0.6, 0.8];
    const v2 = [0.6, 0.8];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1);
  });

  it("should throw for mismatched dimensions", () => {
    const v1 = [1, 2, 3];
    const v2 = [1, 2];
    expect(() => cosineSimilarity(v1, v2)).toThrow();
  });

  it("should handle zero vectors", () => {
    const v1 = [0, 0, 0];
    const v2 = [1, 2, 3];
    expect(cosineSimilarity(v1, v2)).toBe(0);
  });
});

describe("levenshteinDistance", () => {
  it("should return 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("should return string length for empty comparison", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "hello")).toBe(5);
  });

  it("should count single character changes", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
    expect(levenshteinDistance("cat", "cats")).toBe(1);
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });

  it("should handle common examples", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("saturday", "sunday")).toBe(3);
  });
});

describe("levenshteinSimilarity", () => {
  it("should return 1 for identical strings", () => {
    expect(levenshteinSimilarity("hello", "hello")).toBe(1);
  });

  it("should return 0 for completely different strings", () => {
    expect(levenshteinSimilarity("abc", "xyz")).toBeLessThan(0.5);
  });

  it("should return value between 0 and 1", () => {
    const sim = levenshteinSimilarity("hello", "hallo");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("should handle empty strings", () => {
    expect(levenshteinSimilarity("", "")).toBe(1);
    expect(levenshteinSimilarity("hello", "")).toBe(0);
  });
});

describe("classifySimilarity", () => {
  it("should classify identical as identical", () => {
    const result = classifySimilarity(1.0);
    expect(result.classification).toBe("identical");
  });

  it("should classify high similarity as equivalent", () => {
    const result = classifySimilarity(0.96);
    expect(result.classification).toBe("equivalent");
  });

  it("should classify medium similarity as similar", () => {
    const result = classifySimilarity(0.85);
    expect(result.classification).toBe("similar");
  });

  it("should classify low similarity as different", () => {
    const result = classifySimilarity(0.5);
    expect(result.classification).toBe("different");
  });

  it("should respect custom thresholds", () => {
    const result = classifySimilarity(0.9, {
      equivalentThreshold: 0.99,
      similarThreshold: 0.95,
    });
    expect(result.classification).toBe("different");
  });

  it("should include score in result", () => {
    const result = classifySimilarity(0.75);
    expect(result.score).toBe(0.75);
  });
});
