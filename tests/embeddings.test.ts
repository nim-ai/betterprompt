/**
 * Embeddings module tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CharFrequencyEmbeddingProvider,
  EmbeddingCache,
  CachedEmbeddingProvider,
  getDefaultProvider,
  setDefaultProvider,
  isMLEmbeddingsActive,
  type EmbeddingProvider,
} from "../src/embeddings/index.js";

describe("EmbeddingCache", () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache(3); // Small cache for testing
  });

  it("should store and retrieve embeddings", () => {
    const embedding = [0.1, 0.2, 0.3];
    cache.set("hello", embedding);
    expect(cache.get("hello")).toEqual(embedding);
  });

  it("should return undefined for missing keys", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("should check if key exists", () => {
    cache.set("hello", [0.1]);
    expect(cache.has("hello")).toBe(true);
    expect(cache.has("world")).toBe(false);
  });

  it("should clear all entries", () => {
    cache.set("hello", [0.1]);
    cache.set("world", [0.2]);
    cache.clear();
    expect(cache.has("hello")).toBe(false);
    expect(cache.has("world")).toBe(false);
  });

  it("should evict oldest entry when at capacity", () => {
    cache.set("a", [0.1]);
    cache.set("b", [0.2]);
    cache.set("c", [0.3]);
    // Cache is now full (maxSize=3)
    cache.set("d", [0.4]);
    // "a" should be evicted (LRU)
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.has("d")).toBe(true);
  });
});

describe("CharFrequencyEmbeddingProvider", () => {
  let provider: CharFrequencyEmbeddingProvider;

  beforeEach(() => {
    provider = new CharFrequencyEmbeddingProvider();
  });

  it("should have correct name and dimension", () => {
    expect(provider.name).toBe("char-frequency-fallback");
    expect(provider.dimension).toBe(128);
  });

  it("should return character frequency embeddings", async () => {
    const embeddings = await provider.embed(["hello", "world"]);
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]).toHaveLength(128);
    expect(embeddings[1]).toHaveLength(128);
  });

  it("should produce similar embeddings for similar text", async () => {
    const embeddings = await provider.embed(["hello world", "hello there"]);
    // Both have "hello " in common, so should have some similarity
    const dotProduct = embeddings[0]!.reduce(
      (sum, val, i) => sum + val * embeddings[1]![i]!,
      0
    );
    expect(dotProduct).toBeGreaterThan(0.5); // Some similarity expected
  });

  it("should handle empty input", async () => {
    const embeddings = await provider.embed([]);
    expect(embeddings).toEqual([]);
  });
});

describe("CachedEmbeddingProvider", () => {
  let mockProvider: EmbeddingProvider;
  let cachedProvider: CachedEmbeddingProvider;

  beforeEach(() => {
    mockProvider = {
      name: "mock",
      dimension: 3,
      embed: vi.fn(async (texts: string[]) =>
        texts.map((_, i) => [i * 0.1, i * 0.2, i * 0.3])
      ),
    };
    cachedProvider = new CachedEmbeddingProvider(mockProvider);
  });

  it("should have correct name and dimension", () => {
    expect(cachedProvider.name).toBe("cached-mock");
    expect(cachedProvider.dimension).toBe(3);
  });

  it("should call underlying provider for uncached texts", async () => {
    const embeddings = await cachedProvider.embed(["hello", "world"]);
    expect(mockProvider.embed).toHaveBeenCalledTimes(1);
    expect(mockProvider.embed).toHaveBeenCalledWith(["hello", "world"]);
    expect(embeddings).toHaveLength(2);
  });

  it("should use cache for repeated texts", async () => {
    // First call - cache miss
    await cachedProvider.embed(["hello", "world"]);
    expect(mockProvider.embed).toHaveBeenCalledTimes(1);

    // Second call - cache hit
    await cachedProvider.embed(["hello", "world"]);
    expect(mockProvider.embed).toHaveBeenCalledTimes(1); // Still 1

    // Third call - partial cache hit
    await cachedProvider.embed(["hello", "new"]);
    expect(mockProvider.embed).toHaveBeenCalledTimes(2);
    expect(mockProvider.embed).toHaveBeenLastCalledWith(["new"]);
  });

  it("should preserve order with mixed cache hits", async () => {
    // Cache "a" and "c"
    await cachedProvider.embed(["a", "c"]);

    // Now request "a", "b", "c" - "b" is uncached
    mockProvider.embed = vi.fn(async (texts: string[]) =>
      texts.map(() => [9, 9, 9])
    );

    const embeddings = await cachedProvider.embed(["a", "b", "c"]);

    // "a" and "c" should come from cache (original values)
    // "b" should come from provider (new value)
    expect(embeddings[0]).toEqual([0, 0, 0]); // "a" from cache
    expect(embeddings[1]).toEqual([9, 9, 9]); // "b" from provider
    expect(embeddings[2]).toEqual([0.1, 0.2, 0.3]); // "c" from cache
  });

  it("should use custom cache if provided", async () => {
    const customCache = new EmbeddingCache(100);
    customCache.set("precached", [1, 2, 3]);

    const providerWithCache = new CachedEmbeddingProvider(
      mockProvider,
      customCache
    );

    const embeddings = await providerWithCache.embed(["precached"]);
    expect(mockProvider.embed).not.toHaveBeenCalled();
    expect(embeddings).toEqual([[1, 2, 3]]);
  });
});

describe("getDefaultProvider and setDefaultProvider", () => {
  it("should return a provider", () => {
    const provider = getDefaultProvider();
    expect(provider).toBeDefined();
    expect(provider.name).toBeDefined();
    expect(provider.dimension).toBeDefined();
    expect(typeof provider.embed).toBe("function");
  });

  it("should allow setting a custom provider", () => {
    const originalProvider = getDefaultProvider();

    const customProvider = new CharFrequencyEmbeddingProvider();
    setDefaultProvider(customProvider);

    expect(getDefaultProvider()).toBe(customProvider);

    // Restore original
    setDefaultProvider(originalProvider);
  });
});

describe("isMLEmbeddingsActive", () => {
  it("should return true when ML provider is active", () => {
    // Default provider in Node.js should be ML-based (model2vec)
    const provider = getDefaultProvider();
    const isML = isMLEmbeddingsActive();

    // The result depends on whether the name includes "model2vec"
    expect(typeof isML).toBe("boolean");
    if (provider.name.includes("model2vec")) {
      expect(isML).toBe(true);
    }
  });

  it("should return false when fallback provider is set", () => {
    const originalProvider = getDefaultProvider();

    // Set fallback provider
    setDefaultProvider(new CharFrequencyEmbeddingProvider());
    expect(isMLEmbeddingsActive()).toBe(false);

    // Restore
    setDefaultProvider(originalProvider);
  });

  it("should return false when custom non-ML provider is set", () => {
    const originalProvider = getDefaultProvider();

    // Set a custom provider without model2vec in name
    const customProvider: EmbeddingProvider = {
      name: "custom-test-provider",
      dimension: 10,
      embed: async (texts) => texts.map(() => new Array(10).fill(0)),
    };
    setDefaultProvider(customProvider);
    expect(isMLEmbeddingsActive()).toBe(false);

    // Restore
    setDefaultProvider(originalProvider);
  });
});
