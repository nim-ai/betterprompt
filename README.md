# @nim-ai/betterprompt

Language-agnostic algorithm for intelligently merging and upgrading natural language text, treating edits as first-class semantic operations.
Think of it like a `git merge` for prompts and other text. The same principles can be applied to documents, code comments, or any other natural language content, but the most obvious use case is prompt management.
You can use this to merge user-defined prompt refinements with upstream improvements without losing customizations.

[![CI](https://github.com/nim-ai/betterprompt/actions/workflows/ci.yml/badge.svg)](https://github.com/nim-ai/betterprompt/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/nim-ai/betterprompt/graph/badge.svg)](https://codecov.io/gh/nim-ai/betterprompt)
[![npm](https://img.shields.io/npm/v/@nim-ai/betterprompt)](https://www.npmjs.com/package/@nim-ai/betterprompt)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- **Semantic merge** (three-way optional) for text (like git merge, but for natural language)
- **Patch generation and application** for portable text upgrades
- **No LLM required** with bundled sentence embeddings (no runtime downloads), but this is optional.
- **Language-agnostic** and should work with any natural language
- **Extensible** should you need to plug in custom embedding providers or conflict resolvers
- **Browser & Node.js** support provided

## Installation

```bash
npm install @nim-ai/betterprompt
```

## Quick Start

### Three-Way Merge (Upgrade Base + Preserve User Customizations)

The most common use case: you have a base prompt, the user customized it, and now you want to upgrade the base while keeping their changes.

```typescript
import { merge } from "@nim-ai/betterprompt";

// Original base prompt (what user started with)
const originalBase = `
You are a helpful assistant.
Be concise and accurate.
Always be polite.
`;

// Your upgraded base prompt (improvements you want to apply)
const upgradedBase = `
You are a helpful AI assistant.
Be concise, accurate, and thorough.
Always be polite and professional.
Cite sources when possible.
`;

// User's customized version (based on original, with their changes)
const userVersion = `
You are a helpful assistant specialized in Python.
Be concise and accurate.
Always be friendly and polite.
Focus on best practices.
`;

// Merge: apply your upgrades while preserving user's customizations
const result = await merge(originalBase, upgradedBase, userVersion, {
  conflictStrategy: "prefer-c", // When in conflict, keep user's version
});

console.log(result.merged);
// You are a helpful AI assistant specialized in Python.  ← upgraded + user's specialty
// Be concise, accurate, and thorough.                   ← your upgrade (user didn't change)
// Always be friendly and polite.                        ← user's change preserved
// Focus on best practices.                              ← user's addition kept
// Cite sources when possible.                           ← your new addition
```

### Two-Way Merge (Combine Two Prompts)

Merge new instructions into an existing prompt without duplicating content:

```typescript
import { merge } from "@nim-ai/betterprompt";

const currentPrompt = `
You are a helpful assistant.
Be concise and accurate.
Always be polite.
`;

const newInstructions = `
You are an AI assistant.
Be thorough in explanations.
Cite sources when possible.
`;

// Use empty string as "original" to combine two prompts
const result = await merge("", newInstructions, currentPrompt, {
  conflictStrategy: "concatenate",
});

console.log(result.merged);
// Combines both, avoiding duplicates based on semantic similarity
```

### Generate and Apply Patches

```typescript
import { generatePatch, applyPatch, serializePatch } from "@nim-ai/betterprompt";

// When user customizes the base
const patch = await generatePatch(baseV1, userCustom);

// Save the patch
const json = serializePatch(patch);
localStorage.setItem("user-patch", json);

// Later, when base is upgraded
const result = await applyPatch(baseV2, patch);
console.log(result.result);
```

### Diff Two Texts

```typescript
import { diff, summarizeDiff } from "@nim-ai/betterprompt";

const result = await diff(
  "The quick brown fox jumps over the lazy dog.",
  "The fast brown fox leaps over the sleepy dog."
);

console.log(summarizeDiff(result));
// "2 modified"
```

## Conflict Strategies

When both B (upgraded) and C (user customized) change the same content, use `conflictStrategy`:

| Strategy | Description |
| --- | --- |
| `prefer-c` | Automatically choose C's version (user's) — **default** |
| `prefer-b` | Automatically choose B's version (upgraded) |
| `prefer-a` | Automatically choose A's version (original) |
| `defer` | Leave conflict markers for manual resolution |
| `concatenate` | Include both versions |

```typescript
const result = await merge(a, b, c, { conflictStrategy: "prefer-b" });
```

## API

### Core Functions

- `merge(baseV1, baseV2, userCustom, options?)` — Three-way merge
- `diff(original, modified)` — Compute differences
- `generatePatch(base, modified)` — Create a portable patch
- `applyPatch(newBase, patch)` — Apply a patch to new base
- `segment(text, options?)` — Segment text into semantic units
  - `granularity`: `'sentence'` | `'paragraph'` | `'section'`
  - `preserveMarkdown`: preserve code blocks, detect headings/lists
- `align(source, target, options?)` — Align two sets of semantic units

### Types

See [src/types/index.ts](./src/types/index.ts) for full type definitions.

## Browser Usage

```typescript
import { merge, initBrowser } from "@nim-ai/betterprompt/browser";

// Optional: pre-load the embedding model
await initBrowser();

const result = await merge(baseV1, baseV2, userCustom);
```

In the browser, the library uses Model2Vec embeddings via ONNX Runtime for semantic similarity. If the model fails to load, it falls back to char-frequency similarity (fast, offline). You can also provide a custom embedding provider.

## Custom Embedding Provider

```typescript
import {
  merge,
  setDefaultProvider,
  type EmbeddingProvider,
} from "@nim-ai/betterprompt";

const customProvider: EmbeddingProvider = {
  name: "my-provider",
  dimension: 768,
  async embed(texts) {
    // Your embedding logic here
    return texts.map(() => new Array(768).fill(0));
  },
};

setDefaultProvider(customProvider);
```

## Extension Points

The library is designed to work without any LLM, but provides interfaces for optional LLM-assisted features:

```typescript
import type { ConflictResolver, QualityComparator } from "@nim-ai/betterprompt";

// Implement these interfaces to add LLM-powered resolution
const llmResolver: ConflictResolver = {
  async resolve(conflict) {
    // Call your LLM here
    return {
      conflictId: conflict.id,
      resolved: "...",
      source: "external",
      confidence: 0.9,
    };
  },
};

const result = await merge(baseV1, baseV2, userCustom, {
  resolver: llmResolver,
});
```

## CLI

The package includes a command-line interface:

```bash
# Install globally
npm install -g @nim-ai/betterprompt

# Show differences between two files
betterprompt diff original.txt modified.txt

# Generate a patch
betterprompt patch base.txt custom.txt -o my-patch.json

# Apply a patch to a new base
betterprompt apply new-base.txt my-patch.json

# Three-way merge
betterprompt merge base-v1.txt base-v2.txt user-custom.txt -o merged.txt

# Use --no-ml to skip ML model (uses char-frequency similarity)
betterprompt merge base-v1.txt base-v2.txt user.txt --no-ml
```

Run `betterprompt --help` for all options.

## Performance

The library is optimized for typical prompt sizes (<100ms target):

```
merge: typical prompt (10 sentences)  ~0.6ms
merge: large prompt (50 sentences)    ~5.6ms
diff: 20 sentences                    ~1.5ms
```

Run benchmarks with `npm run bench`.

## How It Works

1. **Segment** texts into semantic units (sentences)
2. **Embed** units using sentence transformers
3. **Align** units between versions using semantic similarity
4. **Extract** edits (insertions, deletions, modifications)
5. **Merge** using three-way algorithm with configurable conflict resolution
6. **Reconstruct** the final text

See [docs/SPEC.md](./docs/SPEC.md) for the technical specification.

## Demo

Try the [live demo](https://nim-ai.github.io/betterprompt) to see it in action.

To run the demo locally:

```bash
npm run demo:dev    # Start dev server at http://localhost:5173
npm run demo:build  # Build for production
npm run demo:preview # Preview production build
```

## Bundled Model

This package includes a pre-trained [Model2Vec](https://github.com/MinishLab/model2vec) embedding model for semantic similarity. The model uses the tokenizer from [BAAI/bge-base-en-v1.5](https://huggingface.co/BAAI/bge-base-en-v1.5).

Both are released under the **MIT License** and are free for commercial use.

### Why ML Embeddings?

The ML model's key advantage is **discrimination**: it gives low similarity scores for unrelated content. The char-frequency fallback gives high scores (~0.75) to any English text due to common letter distributions. ML embeddings maintain a 6x larger gap between similar and unrelated content, enabling more accurate sentence alignment during merges.

If you prefer not to use the bundled model:
- Use `--no-ml` flag in CLI to use char-frequency similarity instead
- Provide a custom embedding provider via `setDefaultProvider()`

## License

[MIT](./LICENSE)
