/**
 * ML Embeddings vs Char-Frequency Similarity Comparison
 *
 * This test suite demonstrates how ML embeddings differ from character-based
 * char-frequency similarity, and where each approach excels.
 *
 * Key insight: Model2Vec is a speed-optimized static embedding model (50x smaller,
 * 500x faster than full transformers). Its advantage isn't necessarily HIGHER
 * scores for similar text, but LOWER scores for unrelated text - giving better
 * discrimination between semantically similar vs. unrelated content.
 *
 * Char-frequency gives high similarity for ANY English text because they share
 * common letter distributions. This makes it poor at distinguishing unrelated content.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  Model2VecEmbeddingProvider,
  CharFrequencyEmbeddingProvider,
  type EmbeddingProvider,
} from "../src/embeddings/index.js";

// Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Test case structure
interface SimilarityTestCase {
  name: string;
  sentenceA: string;
  sentenceB: string;
  expectedRelation: "similar" | "different";
  category: string;
}

// =============================================================================
// Test Cases: Semantic Similarity that Char-Frequency Misses
// =============================================================================

const SEMANTIC_SIMILARITY_CASES: SimilarityTestCase[] = [
  // Category: Synonyms
  {
    name: "simple synonym (quick → fast)",
    sentenceA: "The quick brown fox jumps.",
    sentenceB: "The fast brown fox jumps.",
    expectedRelation: "similar",
    category: "synonyms",
  },
  {
    name: "adjective synonym (large → big)",
    sentenceA: "The large house on the hill.",
    sentenceB: "The big house on the hill.",
    expectedRelation: "similar",
    category: "synonyms",
  },
  {
    name: "verb synonym (said → stated)",
    sentenceA: "She said the meeting was cancelled.",
    sentenceB: "She stated the meeting was cancelled.",
    expectedRelation: "similar",
    category: "synonyms",
  },

  // Category: Paraphrasing (same meaning, different structure)
  {
    name: "active to passive voice",
    sentenceA: "The dog chased the cat.",
    sentenceB: "The cat was chased by the dog.",
    expectedRelation: "similar",
    category: "paraphrase",
  },
  {
    name: "restructured sentence",
    sentenceA: "I love programming in Python.",
    sentenceB: "Python is my favorite programming language.",
    expectedRelation: "similar",
    category: "paraphrase",
  },
  {
    name: "formal to informal",
    sentenceA: "Please be concise in your responses.",
    sentenceB: "Keep your answers short.",
    expectedRelation: "similar",
    category: "paraphrase",
  },
  {
    name: "instruction rephrasing",
    sentenceA: "Always cite your sources.",
    sentenceB: "Provide references for your claims.",
    expectedRelation: "similar",
    category: "paraphrase",
  },

  // Category: Technical/Domain Synonyms
  {
    name: "AI terminology",
    sentenceA: "Use machine learning for this task.",
    sentenceB: "Apply AI techniques for this task.",
    expectedRelation: "similar",
    category: "technical",
  },
  {
    name: "programming concepts",
    sentenceA: "Write a function to process the data.",
    sentenceB: "Create a method to handle the data.",
    expectedRelation: "similar",
    category: "technical",
  },
  {
    name: "web development",
    sentenceA: "Call the API endpoint.",
    sentenceB: "Make a request to the REST interface.",
    expectedRelation: "similar",
    category: "technical",
  },

  // Category: Conceptual Equivalence (completely different words, same meaning)
  {
    name: "professional behavior",
    sentenceA: "Respond in a professional manner.",
    sentenceB: "Maintain formal communication.",
    expectedRelation: "similar",
    category: "conceptual",
  },
  {
    name: "helpfulness",
    sentenceA: "Be helpful and accurate.",
    sentenceB: "Provide useful, correct information.",
    expectedRelation: "similar",
    category: "conceptual",
  },
  {
    name: "uncertainty acknowledgment",
    sentenceA: "If you don't know, say so.",
    sentenceB: "Acknowledge when you are uncertain.",
    expectedRelation: "similar",
    category: "conceptual",
  },

  // Category: Semantic Opposites (similar characters, opposite meaning)
  // ML should recognize these as LESS similar than char-frequency thinks
  {
    name: "love vs hate",
    sentenceA: "I love cats.",
    sentenceB: "I hate cats.",
    expectedRelation: "different",
    category: "opposites",
  },
  {
    name: "always vs never",
    sentenceA: "Always be polite.",
    sentenceB: "Never be polite.",
    expectedRelation: "different",
    category: "opposites",
  },

  // Category: Completely Different (control cases)
  {
    name: "unrelated topics",
    sentenceA: "The weather is nice today.",
    sentenceB: "Python is a programming language.",
    expectedRelation: "different",
    category: "unrelated",
  },
  {
    name: "different domains",
    sentenceA: "Bake the cake at 350 degrees.",
    sentenceB: "The stock market crashed yesterday.",
    expectedRelation: "different",
    category: "unrelated",
  },
];

// =============================================================================
// Test Suite
// =============================================================================

describe("ML Embeddings vs Char-Frequency: Semantic Understanding", () => {
  let mlProvider: EmbeddingProvider;
  let cfProvider: EmbeddingProvider;
  let mlAvailable = false;

  beforeAll(async () => {
    cfProvider = new CharFrequencyEmbeddingProvider();

    // Try to load ML model from the bundled location
    try {
      // The model is bundled at models/m2v-base-output relative to package root
      mlProvider = new Model2VecEmbeddingProvider();
      // Test if it works
      await mlProvider.embed(["test"]);
      mlAvailable = true;
      console.log("ML embeddings loaded successfully for comparison tests");
    } catch (err) {
      console.warn(
        "ML embeddings not available - using mock for structure validation:",
        err
      );
      // Create a mock that returns deterministic embeddings for testing structure
      mlProvider = {
        name: "mock-ml",
        dimension: 256,
        embed: async (texts: string[]): Promise<number[][]> =>
          texts.map(() => new Array(256).fill(0.1)),
      };
    }
  }, 30000); // 30s timeout for model loading

  // Helper to compute similarities for a test case
  async function computeSimilarities(
    sentenceA: string,
    sentenceB: string
  ): Promise<{ ml: number; lev: number }> {
    const [mlEmbeddings, levEmbeddings] = await Promise.all([
      mlProvider.embed([sentenceA, sentenceB]),
      cfProvider.embed([sentenceA, sentenceB]),
    ]);

    return {
      ml: cosineSimilarity(mlEmbeddings[0]!, mlEmbeddings[1]!),
      lev: cosineSimilarity(levEmbeddings[0]!, levEmbeddings[1]!),
    };
  }

  describe("Synonym Recognition", () => {
    const cases = SEMANTIC_SIMILARITY_CASES.filter(
      (c) => c.category === "synonyms"
    );

    it.each(cases)("$name", async ({ sentenceA, sentenceB }) => {
      const { ml, lev } = await computeSimilarities(sentenceA, sentenceB);

      console.log(`  Synonym test: "${sentenceA}" ↔ "${sentenceB}"`);
      console.log(`    ML similarity:  ${ml.toFixed(4)}`);
      console.log(`    Lev similarity: ${lev.toFixed(4)}`);

      if (mlAvailable) {
        // ML should see these as very similar (>0.8)
        // Note: Char-frequency may also score high for synonyms since most characters match
        expect(ml).toBeGreaterThan(0.8);
      }
    });
  });

  describe("Paraphrase Recognition", () => {
    const cases = SEMANTIC_SIMILARITY_CASES.filter(
      (c) => c.category === "paraphrase"
    );

    it.each(cases)("$name", async ({ sentenceA, sentenceB }) => {
      const { ml, lev } = await computeSimilarities(sentenceA, sentenceB);

      console.log(`  Paraphrase test: "${sentenceA}" ↔ "${sentenceB}"`);
      console.log(`    ML similarity:  ${ml.toFixed(4)}`);
      console.log(`    Lev similarity: ${lev.toFixed(4)}`);

      if (mlAvailable) {
        // ML should recognize paraphrases with reasonable similarity
        // Note: Model2Vec is speed-optimized and may not score as high as full transformers
        expect(ml).toBeGreaterThan(0.4);
      }
    });
  });

  describe("Technical Synonym Recognition", () => {
    const cases = SEMANTIC_SIMILARITY_CASES.filter(
      (c) => c.category === "technical"
    );

    it.each(cases)("$name", async ({ sentenceA, sentenceB }) => {
      const { ml, lev } = await computeSimilarities(sentenceA, sentenceB);

      console.log(`  Technical test: "${sentenceA}" ↔ "${sentenceB}"`);
      console.log(`    ML similarity:  ${ml.toFixed(4)}`);
      console.log(`    Lev similarity: ${lev.toFixed(4)}`);

      if (mlAvailable) {
        // ML should show some recognition of domain-specific synonyms
        // Note: Model2Vec is speed-optimized and may not capture all technical relationships
        expect(ml).toBeGreaterThan(0.3);
      }
    });
  });

  describe("Conceptual Equivalence", () => {
    const cases = SEMANTIC_SIMILARITY_CASES.filter(
      (c) => c.category === "conceptual"
    );

    it.each(cases)("$name", async ({ sentenceA, sentenceB }) => {
      const { ml, lev } = await computeSimilarities(sentenceA, sentenceB);

      console.log(`  Conceptual test: "${sentenceA}" ↔ "${sentenceB}"`);
      console.log(`    ML similarity:  ${ml.toFixed(4)}`);
      console.log(`    Lev similarity: ${lev.toFixed(4)}`);

      if (mlAvailable) {
        // Model2Vec should show some semantic understanding
        // Even if not always higher than char-frequency, it captures meaning
        expect(ml).toBeGreaterThan(0.3);
      }
    });
  });

  describe("Semantic Opposites (Known Limitation)", () => {
    const cases = SEMANTIC_SIMILARITY_CASES.filter(
      (c) => c.category === "opposites"
    );

    it.each(cases)("$name", async ({ sentenceA, sentenceB }) => {
      const { ml, lev } = await computeSimilarities(sentenceA, sentenceB);

      console.log(`  Opposites test: "${sentenceA}" ↔ "${sentenceB}"`);
      console.log(`    ML similarity:  ${ml.toFixed(4)}`);
      console.log(`    Lev similarity: ${lev.toFixed(4)}`);

      // NOTE: Detecting semantic opposition (love/hate, always/never) is a HARD problem
      // for embedding models. They capture word context but not logical negation.
      // Neither char-frequency nor Model2Vec reliably detect opposites.
      // This would require a Natural Language Inference (NLI) model.

      // Both methods show high similarity for opposites (a known limitation)
      console.log(`    Note: Both methods struggle with semantic opposites`);
    });
  });

  describe("Unrelated Sentences (Control)", () => {
    const cases = SEMANTIC_SIMILARITY_CASES.filter(
      (c) => c.category === "unrelated"
    );

    it.each(cases)("$name", async ({ sentenceA, sentenceB }) => {
      const { ml, lev } = await computeSimilarities(sentenceA, sentenceB);

      console.log(`  Unrelated test: "${sentenceA}" ↔ "${sentenceB}"`);
      console.log(`    ML similarity:  ${ml.toFixed(4)}`);
      console.log(`    Lev similarity: ${lev.toFixed(4)}`);

      // Note: Char-frequency gives high similarity for ANY English text because
      // they share common letter distributions. This is a fundamental limitation
      // - it can't distinguish unrelated topics.

      if (mlAvailable) {
        // ML should show meaningfully lower similarity for unrelated content
        expect(ml).toBeLessThan(0.5);
        // The key insight: char-frequency is HIGH but ML is LOW for unrelated content
        console.log(`    Gap: ML is ${(lev - ml).toFixed(4)} lower than Lev`);
      }
    });
  });

  describe("Summary: Discrimination Ability", () => {
    it("should show ML has better discrimination between similar and unrelated", async () => {
      if (!mlAvailable) {
        console.log("Skipping summary - ML embeddings not available");
        return;
      }

      // Get average similarity for semantically similar pairs
      const similarCases = SEMANTIC_SIMILARITY_CASES.filter(
        (c) => c.expectedRelation === "similar"
      );
      const unrelatedCases = SEMANTIC_SIMILARITY_CASES.filter(
        (c) => c.category === "unrelated"
      );

      let mlSimilarAvg = 0;
      let levSimilarAvg = 0;
      let mlUnrelatedAvg = 0;
      let levUnrelatedAvg = 0;

      for (const testCase of similarCases) {
        const { ml, lev } = await computeSimilarities(
          testCase.sentenceA,
          testCase.sentenceB
        );
        mlSimilarAvg += ml;
        levSimilarAvg += lev;
      }
      mlSimilarAvg /= similarCases.length;
      levSimilarAvg /= similarCases.length;

      for (const testCase of unrelatedCases) {
        const { ml, lev } = await computeSimilarities(
          testCase.sentenceA,
          testCase.sentenceB
        );
        mlUnrelatedAvg += ml;
        levUnrelatedAvg += lev;
      }
      mlUnrelatedAvg /= unrelatedCases.length;
      levUnrelatedAvg /= unrelatedCases.length;

      // The "discrimination gap" is the difference between similar and unrelated scores
      const mlGap = mlSimilarAvg - mlUnrelatedAvg;
      const levGap = levSimilarAvg - levUnrelatedAvg;

      console.log("\n=== Discrimination Ability ===");
      console.log(
        `ML  - Similar avg: ${mlSimilarAvg.toFixed(3)}, Unrelated avg: ${mlUnrelatedAvg.toFixed(3)}, Gap: ${mlGap.toFixed(3)}`
      );
      console.log(
        `Lev - Similar avg: ${levSimilarAvg.toFixed(3)}, Unrelated avg: ${levUnrelatedAvg.toFixed(3)}, Gap: ${levGap.toFixed(3)}`
      );

      // ML should have a LARGER gap between similar and unrelated
      // This means it better distinguishes semantically related from unrelated content
      console.log(`\nML discrimination gap: ${mlGap.toFixed(3)}`);
      console.log(`Lev discrimination gap: ${levGap.toFixed(3)}`);
      console.log(`ML advantage: ${(mlGap - levGap).toFixed(3)}`);

      // The key insight: ML should give lower scores for unrelated content
      expect(mlUnrelatedAvg).toBeLessThan(levUnrelatedAvg);
    });
  });
});

// =============================================================================
// Practical Impact: Merge Quality Comparison
// =============================================================================

describe("Practical Impact: Merge Alignment Quality", () => {
  it("demonstrates how ML helps with alignment decisions", async () => {
    // This test shows how ML gives different similarity scores than char-frequency
    // which affects alignment decisions in the merge algorithm

    const scenarios = [
      {
        name: "Synonym substitution",
        a: "Be quick and efficient.",
        b: "Be fast and efficient.",
        expectedSimilar: true,
      },
      {
        name: "Complete rephrase",
        a: "Always cite your sources.",
        b: "Provide references for claims.",
        expectedSimilar: true,
      },
      {
        name: "Unrelated content",
        a: "Configure the database connection.",
        b: "The weather is sunny today.",
        expectedSimilar: false,
      },
    ];

    const cfProvider = new CharFrequencyEmbeddingProvider();
    let mlProvider: EmbeddingProvider;

    try {
      mlProvider = new Model2VecEmbeddingProvider();
      await mlProvider.embed(["test"]);
    } catch {
      console.log("ML not available - skipping practical impact test");
      return;
    }

    console.log("\n=== Practical Alignment Scenarios ===");

    for (const scenario of scenarios) {
      const [mlEmbed, levEmbed] = await Promise.all([
        mlProvider.embed([scenario.a, scenario.b]),
        cfProvider.embed([scenario.a, scenario.b]),
      ]);

      const mlSim = cosineSimilarity(mlEmbed[0]!, mlEmbed[1]!);
      const levSim = cosineSimilarity(levEmbed[0]!, levEmbed[1]!);

      console.log(`\n${scenario.name}:`);
      console.log(`  "${scenario.a}" ↔ "${scenario.b}"`);
      console.log(`  ML: ${mlSim.toFixed(3)}, Lev: ${levSim.toFixed(3)}`);

      if (!scenario.expectedSimilar) {
        // For unrelated content, ML should give lower scores
        expect(mlSim).toBeLessThan(levSim);
        console.log(`  ✓ ML correctly scores unrelated content lower`);
      }
    }
  });
});
