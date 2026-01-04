/**
 * Performance benchmarks for betterprompt.
 *
 * Run with: npm run bench
 *
 * Success criteria from TODO.md:
 * - Performance is acceptable (<100ms for typical prompt sizes)
 */

import { performance } from "node:perf_hooks";
import {
  merge,
  diff,
  generatePatch,
  applyPatch,
  segment,
  setDefaultProvider,
} from "../src/index.js";
import type { EmbeddingProvider } from "../src/types/index.js";

// =============================================================================
// Configuration
// =============================================================================

const WARMUP_ITERATIONS = 2;
const BENCHMARK_ITERATIONS = 10;

// Performance budget (ms) - from success criteria
const BUDGET_TYPICAL_MERGE = 100;

// =============================================================================
// Test Embedding Provider (fast, deterministic)
// =============================================================================

class BenchmarkEmbeddingProvider implements EmbeddingProvider {
  readonly name = "benchmark-provider";
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

// =============================================================================
// Test Data Generators
// =============================================================================

function generatePrompt(sentences: number): string {
  const templates = [
    "You are a helpful assistant.",
    "Always provide accurate information.",
    "Be concise and clear in your responses.",
    "If you're unsure, say so.",
    "Use professional language at all times.",
    "Consider the user's context when responding.",
    "Provide examples when helpful.",
    "Break down complex topics into simple parts.",
    "Ask clarifying questions if needed.",
    "Summarize key points at the end.",
  ];

  const result: string[] = [];
  for (let i = 0; i < sentences; i++) {
    result.push(templates[i % templates.length]!);
  }
  return result.join(" ");
}

function generateModifiedPrompt(base: string, changeRatio: number): string {
  const sentences = base.split(/(?<=[.!?])\s+/);
  const numChanges = Math.ceil(sentences.length * changeRatio);

  for (let i = 0; i < numChanges && i < sentences.length; i++) {
    const idx = Math.floor((i / numChanges) * sentences.length);
    sentences[idx] = sentences[idx]!.replace(/\.$/, " with modifications.");
  }

  return sentences.join(" ");
}

// =============================================================================
// Benchmark Utilities
// =============================================================================

interface BenchmarkResult {
  name: string;
  iterations: number;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  p95: number;
  withinBudget?: boolean;
  budget?: number;
}

async function benchmark(
  name: string,
  fn: () => Promise<void>,
  options: { budget?: number } = {}
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await fn();
  }

  // Benchmark
  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);

  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = times[0]!;
  const max = times[times.length - 1]!;
  const p95 = times[Math.floor(times.length * 0.95)]!;

  const variance =
    times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);

  const result: BenchmarkResult = {
    name,
    iterations: BENCHMARK_ITERATIONS,
    mean,
    min,
    max,
    stdDev,
    p95,
  };

  if (options.budget !== undefined) {
    result.withinBudget = p95 <= options.budget;
    result.budget = options.budget;
  }

  return result;
}

function formatResult(result: BenchmarkResult): string {
  const status =
    result.withinBudget === undefined
      ? ""
      : result.withinBudget
        ? " ✓"
        : ` ✗ (budget: ${result.budget}ms)`;

  return [
    `${result.name}${status}`,
    `  mean: ${result.mean.toFixed(2)}ms`,
    `  min:  ${result.min.toFixed(2)}ms`,
    `  max:  ${result.max.toFixed(2)}ms`,
    `  p95:  ${result.p95.toFixed(2)}ms`,
    `  std:  ${result.stdDev.toFixed(2)}ms`,
  ].join("\n");
}

// =============================================================================
// Benchmarks
// =============================================================================

async function runBenchmarks(): Promise<void> {
  console.log("betterprompt Performance Benchmarks");
  console.log("=".repeat(50));
  console.log(`Warmup: ${WARMUP_ITERATIONS} iterations`);
  console.log(`Benchmark: ${BENCHMARK_ITERATIONS} iterations`);
  console.log("");

  // Use fast embedding provider
  setDefaultProvider(new BenchmarkEmbeddingProvider());

  const results: BenchmarkResult[] = [];
  let failures = 0;

  // -------------------------------------------------------------------------
  // Segmentation Benchmarks
  // -------------------------------------------------------------------------
  console.log("Segmentation");
  console.log("-".repeat(50));

  const shortText = generatePrompt(5);
  const mediumText = generatePrompt(20);
  const longText = generatePrompt(100);

  results.push(
    await benchmark("segment: 5 sentences", async () => {
      segment(shortText);
    })
  );

  results.push(
    await benchmark("segment: 20 sentences", async () => {
      segment(mediumText);
    })
  );

  results.push(
    await benchmark("segment: 100 sentences", async () => {
      segment(longText);
    })
  );

  for (const r of results.slice(-3)) {
    console.log(formatResult(r));
    console.log("");
  }

  // -------------------------------------------------------------------------
  // Diff Benchmarks
  // -------------------------------------------------------------------------
  console.log("Diff");
  console.log("-".repeat(50));

  const shortModified = generateModifiedPrompt(shortText, 0.2);
  const mediumModified = generateModifiedPrompt(mediumText, 0.2);

  results.push(
    await benchmark("diff: 5 sentences (20% changed)", async () => {
      await diff(shortText, shortModified);
    })
  );

  results.push(
    await benchmark("diff: 20 sentences (20% changed)", async () => {
      await diff(mediumText, mediumModified);
    })
  );

  for (const r of results.slice(-2)) {
    console.log(formatResult(r));
    console.log("");
  }

  // -------------------------------------------------------------------------
  // Merge Benchmarks (with budget)
  // -------------------------------------------------------------------------
  console.log("Merge (budget: <100ms for typical prompts)");
  console.log("-".repeat(50));

  // Typical prompt: ~10 sentences
  const typicalV1 = generatePrompt(10);
  const typicalV2 = generateModifiedPrompt(typicalV1, 0.3);
  const typicalUser = generateModifiedPrompt(typicalV1, 0.2);

  const typicalMergeResult = await benchmark(
    "merge: typical prompt (10 sentences)",
    async () => {
      await merge(typicalV1, typicalV2, typicalUser);
    },
    { budget: BUDGET_TYPICAL_MERGE }
  );
  results.push(typicalMergeResult);
  console.log(formatResult(typicalMergeResult));
  if (!typicalMergeResult.withinBudget) failures++;
  console.log("");

  // Larger prompt
  const largeV1 = generatePrompt(50);
  const largeV2 = generateModifiedPrompt(largeV1, 0.3);
  const largeUser = generateModifiedPrompt(largeV1, 0.2);

  results.push(
    await benchmark("merge: large prompt (50 sentences)", async () => {
      await merge(largeV1, largeV2, largeUser);
    })
  );
  console.log(formatResult(results[results.length - 1]!));
  console.log("");

  // -------------------------------------------------------------------------
  // Patch Benchmarks
  // -------------------------------------------------------------------------
  console.log("Patch");
  console.log("-".repeat(50));

  results.push(
    await benchmark("generatePatch: 10 sentences", async () => {
      await generatePatch(typicalV1, typicalUser);
    })
  );
  console.log(formatResult(results[results.length - 1]!));
  console.log("");

  const patch = await generatePatch(typicalV1, typicalUser);
  results.push(
    await benchmark("applyPatch: 10 sentences", async () => {
      await applyPatch(typicalV2, patch);
    })
  );
  console.log(formatResult(results[results.length - 1]!));
  console.log("");

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("=".repeat(50));
  console.log("Summary");
  console.log("-".repeat(50));

  const budgeted = results.filter((r) => r.budget !== undefined);
  const passed = budgeted.filter((r) => r.withinBudget);

  console.log(`Total benchmarks: ${results.length}`);
  console.log(`With budget: ${budgeted.length}`);
  console.log(`Passed: ${passed.length}/${budgeted.length}`);

  if (failures > 0) {
    console.log("");
    console.log(`FAILED: ${failures} benchmark(s) exceeded budget`);
    process.exit(1);
  } else {
    console.log("");
    console.log("All budgeted benchmarks passed!");
  }
}

// Run benchmarks
runBenchmarks().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
