/**
 * Test the exact demo scenario to debug conflicts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { merge } from "../src/merge/index.js";
import {
  setDefaultProvider,
  CharFrequencyEmbeddingProvider,
} from "../src/embeddings/index.js";
import type { EmbeddingProvider } from "../src/types/index.js";

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

describe("Demo scenario", () => {
  const a = `You are a helpful assistant.
You should be concise and accurate.
Always be polite.`;

  const b = `You are a helpful AI assistant.
You should be concise, accurate, and thorough.
Always be polite and professional.
Cite sources when possible.`;

  const c = `You are a helpful assistant specialized in Python programming.
You should be concise and accurate.
Always be polite.
Focus on best practices and clean code.`;

  it("should merge demo content without identical conflicts", async () => {
    const result = await merge(a, b, c);

    console.log("=== MERGED ===");
    console.log(result.merged);
    console.log("\n=== CONFLICTS ===");
    result.conflicts.forEach((conflict, i) => {
      console.log(`Conflict ${i + 1}:`);
      console.log(`  A: "${conflict.a}"`);
      console.log(`  B: "${conflict.b}"`);
      console.log(`  C: "${conflict.c}"`);
    });
    console.log("\n=== STATS ===");
    console.log(result.stats);

    // Check for "identical" conflicts (where B and C are the same)
    const identicalConflicts = result.conflicts.filter((c) => c.b === c.c);

    if (identicalConflicts.length > 0) {
      console.log("\n=== IDENTICAL CONFLICTS (BUG!) ===");
      identicalConflicts.forEach((c) => {
        console.log(`  B === C: "${c.b}"`);
      });
    }

    expect(identicalConflicts).toHaveLength(0);
  });

  it("should handle demo scenario with prefer-c strategy", async () => {
    const result = await merge(a, b, c, { conflictStrategy: "prefer-c" });

    console.log("\n=== WITH prefer-c ===");
    console.log(result.merged);
    console.log("Conflicts:", result.conflicts.length);

    expect(result.conflicts).toHaveLength(0);
  });
});

describe("Demo scenario with char-frequency fallback", () => {
  const a = `You are a helpful assistant.
You should be concise and accurate.
Always be polite.`;

  const b = `You are a helpful AI assistant.
You should be concise, accurate, and thorough.
Always be polite and professional.
Cite sources when possible.`;

  const c = `You are a helpful assistant specialized in Python programming.
You should be concise and accurate.
Always be polite.
Focus on best practices and clean code.`;

  beforeAll(() => {
    // Use char-frequency fallback like the browser does
    setDefaultProvider(new CharFrequencyEmbeddingProvider());
  });

  it("should not produce identical conflicts with char-frequency", async () => {
    const result = await merge(a, b, c);

    console.log("\n=== LEVENSHTEIN FALLBACK ===");
    console.log("Merged:", result.merged);
    console.log("\nConflicts:", result.conflicts.length);
    result.conflicts.forEach((conflict, i) => {
      console.log(`\nConflict ${i + 1}:`);
      console.log(`  A: "${conflict.a}"`);
      console.log(`  B: "${conflict.b}"`);
      console.log(`  C: "${conflict.c}"`);
      console.log(`  B === C? ${conflict.b === conflict.c}`);
    });

    // Check for identical conflicts
    const identicalConflicts = result.conflicts.filter((c) => c.b === c.c);
    expect(identicalConflicts).toHaveLength(0);
  });
});
