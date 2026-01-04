/**
 * Embedding module.
 * Provides sentence embeddings for semantic similarity.
 *
 * - Node.js: Uses bundled M2V_base_output model (no runtime downloads)
 * - Browser: Uses bundled model from public path, or char-frequency fallback
 */

import type { EmbeddingProvider } from "../types/index.js";

/**
 * Check if running in a browser environment.
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Get the path to the bundled model directory (Node.js only).
 */
async function getNodeModelPath(): Promise<string> {
  // Dynamic imports to avoid bundling Node.js modules in browser
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const { existsSync } = await import("node:fs");

  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // Model is at: package-root/models/m2v-base-output
  // This file could be at:
  // - package-root/dist/index.js (bundled with tsup)
  // - package-root/src/embeddings/index.ts (development/tests)
  let packageRoot = join(currentDir, "..");
  let modelPath = join(packageRoot, "models", "m2v-base-output");

  // If not found, try going up one more level (for src/embeddings/ case)
  if (!existsSync(modelPath)) {
    packageRoot = join(currentDir, "..", "..");
    modelPath = join(packageRoot, "models", "m2v-base-output");
  }

  return modelPath;
}

/**
 * ONNX runtime types (unified interface for node and web).
 */
interface OrtModule {
  InferenceSession: {
    create(
      pathOrBuffer: string | ArrayBuffer
    ): Promise<{
      run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>;
    }>;
  };
  Tensor: new (
    type: string,
    data: BigInt64Array | Float32Array,
    dims: number[]
  ) => unknown;
}

/**
 * Model2Vec embedding provider using direct ONNX runtime.
 * Works in both Node.js (local files) and browser (URL fetch).
 *
 * Model2Vec uses a simple architecture:
 * - Tokenize text with WordPiece
 * - Look up pre-computed static embeddings for each token
 * - Average token embeddings to get sentence embedding
 */
export class Model2VecEmbeddingProvider implements EmbeddingProvider {
  readonly name = "model2vec-base";
  readonly dimension = 256; // Model2Vec uses 256 dimensions

  private modelPath: string;
  private ort: OrtModule | null = null;
  private session: unknown = null;
  private tokenizer: unknown = null;
  private loading: Promise<void> | null = null;

  /**
   * @param modelPath - Path to model directory (local path or URL).
   */
  constructor(modelPath?: string) {
    this.modelPath = modelPath ?? "";
  }

  /**
   * Lazily initialize the model.
   */
  private async init(): Promise<void> {
    if (this.session && this.tokenizer) return;

    if (this.loading) {
      await this.loading;
      return;
    }

    this.loading = (async (): Promise<void> => {
      // Dynamic import to avoid loading at module initialization
      const transformers = await import("@xenova/transformers");
      const { AutoTokenizer, env } = transformers;

      // Determine model path
      let modelPath = this.modelPath;
      if (!modelPath) {
        if (isBrowser()) {
          throw new Error(
            "Model2VecEmbeddingProvider requires a modelPath in browser"
          );
        }
        modelPath = await getNodeModelPath();
      }

      // Load tokenizer using transformers.js (it handles both local and remote)
      const loadOptions: Record<string, unknown> = {};

      if (isBrowser()) {
        // In browser: configure transformers.js for remote fetch
        let baseUrl: string;
        let modelName: string;

        if (
          modelPath.startsWith("http://") ||
          modelPath.startsWith("https://")
        ) {
          baseUrl = modelPath.substring(0, modelPath.lastIndexOf("/"));
          modelName = modelPath.substring(modelPath.lastIndexOf("/") + 1);
        } else {
          const fullUrl = new URL(modelPath, window.location.href).href;
          baseUrl = fullUrl.substring(0, fullUrl.lastIndexOf("/"));
          modelName = fullUrl.substring(fullUrl.lastIndexOf("/") + 1);
        }

        env.remoteHost = baseUrl;
        env.remotePathTemplate = "{model}";

        // Load tokenizer
        this.tokenizer = await AutoTokenizer.from_pretrained(modelName);

        // Load ONNX model directly
        const modelUrl = `${baseUrl}/${modelName}/model.onnx`;
        const response = await fetch(modelUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch model: ${response.statusText}`);
        }
        const modelBuffer = await response.arrayBuffer();

        // Use ONNX runtime for web
        const ortWeb = await import("onnxruntime-web");
        // Configure WASM to load from CDN to avoid MIME type issues
        ortWeb.env.wasm.wasmPaths =
          "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/";
        this.ort = ortWeb as unknown as OrtModule;
        this.session = await this.ort.InferenceSession.create(modelBuffer);
      } else {
        // Node.js: use local files
        env.allowRemoteModels = false;
        const { dirname, basename, join } = await import("node:path");
        env.localModelPath = dirname(modelPath);
        const modelName = basename(modelPath);
        loadOptions.local_files_only = true;

        // Load tokenizer
        this.tokenizer = await AutoTokenizer.from_pretrained(
          modelName,
          loadOptions
        );

        // Load ONNX model directly using onnxruntime-node
        this.ort = (await import("onnxruntime-node")) as unknown as OrtModule;
        const modelFile = join(modelPath, "model.onnx");
        this.session = await this.ort.InferenceSession.create(modelFile);
      }
    })();

    await this.loading;
  }

  /**
   * Generate embeddings for a list of texts.
   */
  async embed(texts: string[]): Promise<number[][]> {
    await this.init();

    const tokenizer = this.tokenizer as {
      (
        texts: string[],
        options: { padding: boolean; truncation: boolean }
      ): Promise<{
        input_ids: { data: BigInt64Array; dims: number[] };
      }>;
    };

    const session = this.session as {
      run(feeds: Record<string, unknown>): Promise<{
        embeddings: { data: Float32Array; dims: number[] };
      }>;
    };

    const ort = this.ort!;
    const results: number[][] = [];

    // Process texts one at a time (Model2Vec batch format is complex)
    for (const text of texts) {
      // Tokenize
      const encoded = await tokenizer([text], {
        padding: true,
        truncation: true,
      });

      // Get input_ids as BigInt array
      const inputIdsData = encoded.input_ids.data as BigInt64Array;
      const numTokens = inputIdsData.length;

      // Model2Vec expects:
      // - input_ids: flattened token IDs (int64)
      // - offsets: starting index for each text (int64)
      const inputIdsTensor = new ort.Tensor("int64", inputIdsData, [numTokens]);
      const offsetsTensor = new ort.Tensor(
        "int64",
        new BigInt64Array([BigInt(0)]),
        [1]
      );

      // Run inference
      const output = await session.run({
        input_ids: inputIdsTensor,
        offsets: offsetsTensor,
      });

      // Extract embedding (shape: [1, 256])
      const embeddingData = output.embeddings.data as Float32Array;
      results.push(Array.from(embeddingData));
    }

    return results;
  }
}

/**
 * Simple in-memory cache for embeddings.
 */
export class EmbeddingCache {
  private cache = new Map<string, number[]>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(text: string): number[] | undefined {
    return this.cache.get(text);
  }

  set(text: string, embedding: number[]): void {
    if (this.cache.size >= this.maxSize) {
      // Simple LRU: remove first entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(text, embedding);
  }

  has(text: string): boolean {
    return this.cache.has(text);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Cached embedding provider wrapper.
 */
export class CachedEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;
  readonly name: string;

  private provider: EmbeddingProvider;
  private cache: EmbeddingCache;

  constructor(provider: EmbeddingProvider, cache?: EmbeddingCache) {
    this.provider = provider;
    this.cache = cache ?? new EmbeddingCache();
    this.dimension = provider.dimension;
    this.name = `cached-${provider.name}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      const cached = this.cache.get(text);
      if (cached) {
        results[i] = cached;
      } else {
        uncachedIndices.push(i);
        uncachedTexts.push(text);
      }
    }

    // Embed uncached texts
    if (uncachedTexts.length > 0) {
      const embeddings = await this.provider.embed(uncachedTexts);
      for (let i = 0; i < uncachedIndices.length; i++) {
        const idx = uncachedIndices[i]!;
        const text = uncachedTexts[i]!;
        const embedding = embeddings[i]!;
        this.cache.set(text, embedding);
        results[idx] = embedding;
      }
    }

    return results;
  }
}

/**
 * Fallback provider that uses character frequency vectors.
 * Provides reasonable similarity without ML models.
 * Used when ML embeddings aren't available (browser fallback).
 */
export class CharFrequencyEmbeddingProvider implements EmbeddingProvider {
  readonly name = "char-frequency-fallback";
  readonly dimension = 128; // ASCII printable range

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      // Create character frequency vector for ASCII printable chars
      const freq = new Array(128).fill(0);
      const normalized = text.toLowerCase();

      for (const char of normalized) {
        const code = char.charCodeAt(0);
        if (code >= 0 && code < 128) {
          freq[code]++;
        }
      }

      // Normalize to unit vector for cosine similarity
      const sum = Math.sqrt(freq.reduce((a, b) => a + b * b, 0)) || 1;
      return freq.map((f) => f / sum);
    });
  }
}

// Default provider instance (lazily created)
let defaultProvider: EmbeddingProvider | null = null;

// Default browser model path (can be set by initBrowserEmbeddings)
let browserModelPath: string | null = null;

/**
 * Initialize browser embeddings with a model path.
 * Call this before using merge/diff to enable ML embeddings in browser.
 *
 * @param modelPath - URL path to the model directory (e.g., "/models/m2v-base-output")
 * @returns Promise that resolves when the model is loaded
 */
export async function initBrowserEmbeddings(modelPath: string): Promise<void> {
  if (!isBrowser()) {
    console.warn("initBrowserEmbeddings() called in non-browser environment");
    return;
  }

  // Store the path for later use
  browserModelPath = modelPath;

  // Pre-initialize the provider to catch errors early
  try {
    const provider = new Model2VecEmbeddingProvider(modelPath);
    defaultProvider = new CachedEmbeddingProvider(provider);
    // Test with a simple embedding to verify model loads
    await defaultProvider.embed(["test"]);
    console.log("ML embeddings loaded successfully");
  } catch (error) {
    console.warn("Failed to load ML model, using fallback:", error);
    browserModelPath = null;
    defaultProvider = new CharFrequencyEmbeddingProvider();
  }
}

/**
 * Get the default embedding provider.
 * - Node.js: Uses bundled M2V model for semantic similarity
 * - Browser: Uses ML model if initialized, otherwise char-frequency fallback
 */
export function getDefaultProvider(): EmbeddingProvider {
  if (!defaultProvider) {
    if (isBrowser()) {
      if (browserModelPath) {
        // Browser with initialized model path
        defaultProvider = new CachedEmbeddingProvider(
          new Model2VecEmbeddingProvider(browserModelPath)
        );
      } else {
        // Browser without model: use char-frequency fallback
        defaultProvider = new CharFrequencyEmbeddingProvider();
      }
    } else {
      // Node.js: use bundled ML model
      defaultProvider = new CachedEmbeddingProvider(
        new Model2VecEmbeddingProvider()
      );
    }
  }
  return defaultProvider;
}

/**
 * Set a custom default embedding provider.
 */
export function setDefaultProvider(provider: EmbeddingProvider): void {
  defaultProvider = provider;
}

/**
 * Check if ML embeddings are active (vs fallback).
 */
export function isMLEmbeddingsActive(): boolean {
  if (!defaultProvider) return false;
  return defaultProvider.name.includes("model2vec");
}

export type { EmbeddingProvider };
