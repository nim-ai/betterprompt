# betterprompt

A language-agnostic algorithm for intelligently merging and upgrading natural language text, treating edits as first-class semantic operations.

---

## Project Vision

Enable applications to ship text/prompt upgrades that automatically integrate with user customizations—without requiring an LLM. The core algorithm uses semantic similarity, edit operation extraction, and deterministic merge strategies.

**Core Principle**: Model user edits as _transformations_ (patches), not final states. When base upgrades, replay transformations on the new base.

---

## Phase 1: Specification Document

> **Goal**: Create `SPEC.md` defining how natural language is decomposed, aligned, and merged.

### 1.1 Text Decomposition Model

- [ ] Define segmentation granularity levels:
  - Document → Sections (headers, paragraphs)
  - Section → Sentences
  - Sentence → Clauses/Phrases
  - Phrase → Tokens
- [ ] Specify segmentation algorithm selection (language-agnostic)
  - Sentence boundary detection (rule-based: Pragmatic Segmenter style)
  - Clause extraction (optional, for fine-grained merging)
- [ ] Define "semantic unit" as the atomic merge unit
- [ ] Document handling of:
  - Whitespace and formatting
  - Markdown/structured text (headers, lists, code blocks)
  - Multi-line content preservation

### 1.2 Semantic Hashing & Identity

- [ ] Define content-addressable identity for semantic units
  - Normalization rules (lowercase, whitespace collapse, punctuation)
  - Embedding-based hash (locality-sensitive hashing on sentence embeddings)
  - Stable identity that survives minor rewording
- [ ] Specify similarity thresholds:
  - `IDENTICAL`: exact match after normalization
  - `EQUIVALENT`: cosine similarity > 0.95 (same meaning, different words)
  - `SIMILAR`: cosine similarity > 0.80 (related content)
  - `DIFFERENT`: below threshold
- [ ] Document embedding model requirements:
  - Default: all-MiniLM-L6-v2 (fast, good quality)
  - Extensible: allow custom embedding providers

### 1.3 Alignment Algorithm

- [ ] Specify three-way alignment:
  - `base_v1` ↔ `base_v2` (upstream changes)
  - `base_v1` ↔ `user_custom` (user modifications)
- [ ] Document alignment strategies:
  - Sequential alignment (preserve order, handle insertions/deletions)
  - Semantic alignment (match by meaning when order changes)
  - Hybrid approach
- [ ] Handle alignment edge cases:
  - 1:1 (sentence modified)
  - 1:N (sentence split)
  - N:1 (sentences merged)
  - 0:1 (insertion)
  - 1:0 (deletion)
- [ ] Reference: Neural CRF alignment from text simplification research

### 1.4 Edit Operation Taxonomy

- [ ] Define atomic edit operations:
  ```
  KEEP      - No change
  INSERT    - Add new content
  DELETE    - Remove content
  REPLACE   - Substitute content (DELETE + INSERT)
  MOVE      - Reposition content (DELETE + INSERT elsewhere)
  ```
- [ ] Define edit metadata:
  - `anchor`: semantic hash of original content
  - `operation`: one of the above
  - `old_content`: original text (if applicable)
  - `new_content`: replacement text (if applicable)
  - `position`: relative position hint
- [ ] Document edit extraction algorithm:
  - Compare aligned pairs
  - Generate minimal edit script
  - Reference: WikiAtomicEdits corpus patterns

### 1.5 Merge Strategies

- [ ] Define merge modes:
  ```
  UPGRADE   - Prefer new base, preserve user customizations
  PRESERVE  - Prefer user version, apply non-conflicting base upgrades
  COMBINE   - Attempt to include content from both (may need external resolver)
  ```
- [ ] Specify deterministic merge rules (no LLM required):

  | base_v1→v2 | user change | Result                                   |
  | ---------- | ----------- | ---------------------------------------- |
  | unchanged  | unchanged   | Use base_v2                              |
  | changed    | unchanged   | Use base_v2 (user didn't customize this) |
  | unchanged  | changed     | Use user (preserve customization)        |
  | changed    | changed     | **CONFLICT** - apply resolution strategy |

- [ ] Define conflict resolution strategies:
  - `PREFER_BASE`: Take base_v2
  - `PREFER_USER`: Take user version
  - `CONCATENATE`: Include both (with separator)
  - `DEFER`: Mark for external resolution (LLM or human)
- [ ] Document subsumption detection:
  - If base_v2 semantically contains user's change → use base_v2
  - If user's version contains base_v2's change → use user
  - Uses embedding similarity, not LLM

### 1.6 Patch Format

- [ ] Define serializable patch format:

  ```typescript
  interface Patch {
    version: string; // Patch format version
    baseHash: string; // Hash of original base
    edits: Edit[]; // Ordered list of edits
  }

  interface Edit {
    anchor: string; // Semantic hash of target
    anchorContext?: string; // Surrounding text for fallback matching
    operation: "INSERT" | "DELETE" | "REPLACE" | "MOVE";
    oldContent?: string;
    newContent?: string;
    position?: "before" | "after" | "replace";
    confidence: number; // How certain is this edit's applicability
  }
  ```

- [ ] Document patch application algorithm:
  - Find anchor in new base (exact → semantic → context-based)
  - Apply operation
  - Track success/failure per edit
- [ ] Define patch conflict detection:
  - Anchor not found
  - Anchor found but context changed significantly
  - Multiple possible anchor matches

### 1.7 Extension Points for External Resolvers

- [ ] Define resolver interface:

  ```typescript
  interface ConflictResolver {
    resolve(conflict: Conflict): Promise<Resolution>;
  }

  interface Conflict {
    baseV1: string;
    baseV2: string;
    userVersion: string;
    context: string[];
  }

  interface Resolution {
    resolved: string;
    confidence: number;
    source: "base" | "user" | "merged" | "external";
  }
  ```

- [ ] Document integration patterns:
  - LLM resolver (out of scope, but interface defined)
  - Human-in-the-loop resolver
  - Rule-based resolver
- [ ] Specify when to invoke external resolver:
  - Semantic similarity below threshold
  - Both versions have significant unique content
  - Structural incompatibility

---

## Phase 2: Project Setup

> **Goal**: Modern TypeScript npm package following 2025/2026 best practices.

### 2.1 Repository Structure

- [ ] Initialize repository:
  ```
  betterprompt/
  ├── src/
  │   ├── index.ts              # Public API
  │   ├── segmentation/         # Text decomposition
  │   ├── alignment/            # Semantic alignment
  │   ├── diff/                 # Edit extraction
  │   ├── merge/                # Merge strategies
  │   ├── patch/                # Patch format & application
  │   ├── embeddings/           # Embedding providers
  │   └── types/                # TypeScript interfaces
  ├── tests/
  ├── benchmarks/
  ├── docs/
  │   └── SPEC.md
  ├── examples/
  ├── package.json
  ├── tsconfig.json
  ├── vitest.config.ts
  └── README.md
  ```

### 2.2 Package Configuration

- [ ] Initialize with modern tooling:
  - TypeScript 5.x with strict mode
  - ESM-first with CJS compatibility (dual publishing)
  - Node.js 20+ (use native fetch, etc.)
- [ ] Configure `package.json`:
  - `"type": "module"`
  - `"exports"` field for subpath exports
  - `"types"` field for TypeScript
  - Proper `"files"` array for publishing
- [ ] Set up build tooling:
  - `tsup` or `unbuild` for bundling
  - Dual ESM/CJS output
  - Declaration file generation
- [ ] Configure linting/formatting:
  - ESLint with flat config (eslint.config.js)
  - Prettier or Biome
  - TypeScript strict checks

### 2.3 Testing Infrastructure

- [ ] Set up Vitest for unit testing
- [ ] Create test fixtures:
  - Simple merge cases
  - Conflict scenarios
  - Edge cases (empty, whitespace, unicode)
  - Real-world prompt examples
- [ ] Set up benchmarking:
  - Performance regression tests
  - Memory usage tracking
- [ ] Configure CI/CD:
  - GitHub Actions workflow
  - Test on Node 20, 22
  - Publish to npm on release

### 2.4 Documentation

- [ ] README.md with:
  - Quick start example
  - API overview
  - Use case examples
- [ ] TSDoc comments on all public APIs
- [ ] Generate API docs (TypeDoc or similar)
- [ ] CONTRIBUTING.md

---

## Phase 3: Core Implementation

> **Goal**: Implement the core merge algorithm without LLM dependencies.

### 3.1 Segmentation Module

- [ ] Implement sentence segmentation:
  - Rule-based approach (handle abbreviations, decimals, etc.)
  - Language-agnostic (or with language hints)
  - Consider: `sbd` library or custom implementation
- [ ] Implement paragraph/section detection:
  - Blank line separation
  - Markdown header detection
- [ ] Preserve original formatting metadata:
  - Whitespace
  - Line breaks
  - Indentation
- [ ] Handle structured text:
  - Markdown parsing (lists, code blocks, headers)
  - Preserve structure during merge

### 3.2 Embedding Module

- [ ] Define embedding provider interface:
  ```typescript
  interface EmbeddingProvider {
    embed(texts: string[]): Promise<number[][]>;
    dimension: number;
  }
  ```
- [ ] Implement default provider:
  - Use `@xenova/transformers` (runs locally, no API)
  - Model: all-MiniLM-L6-v2
  - Lazy loading (don't load until needed)
- [ ] Implement caching layer:
  - LRU cache for embeddings
  - Optional persistent cache
- [ ] Implement similarity functions:
  - Cosine similarity
  - Configurable thresholds

### 3.3 Alignment Module

- [ ] Implement sequential alignment:
  - Dynamic programming approach
  - Handle insertions/deletions
- [ ] Implement semantic alignment:
  - Embedding-based matching
  - Hungarian algorithm or greedy matching
- [ ] Implement hybrid alignment:
  - Use sequential as primary
  - Fall back to semantic for moved content
- [ ] Return alignment result:
  ```typescript
  interface AlignmentResult {
    pairs: AlignedPair[];
    unmatched: { source: string[]; target: string[] };
  }
  ```

### 3.4 Diff Module

- [ ] Implement edit extraction:
  - Compare aligned pairs
  - Generate atomic edit operations
- [ ] Implement semantic hash:
  - Normalize text
  - Generate stable identifier
- [ ] Implement edit classification:
  - Detect operation type
  - Calculate confidence score

### 3.5 Merge Module

- [ ] Implement three-way merge:
  - Take base_v1, base_v2, user_custom
  - Produce merged result + conflict report
- [ ] Implement merge strategies:
  - UPGRADE mode
  - PRESERVE mode
  - COMBINE mode (with conflict markers)
- [ ] Implement subsumption detection:
  - Check if one version contains the other's meaning
  - Use embedding similarity
- [ ] Generate merge report:
  ```typescript
  interface MergeResult {
    merged: string;
    conflicts: Conflict[];
    stats: {
      unchanged: number;
      upgraded: number;
      preserved: number;
      conflicts: number;
    };
  }
  ```

### 3.6 Patch Module

- [ ] Implement patch generation:
  - Extract user edits as portable patches
  - Store anchors and operations
- [ ] Implement patch application:
  - Apply patch to new base
  - Handle anchor matching failures gracefully
- [ ] Implement patch serialization:
  - JSON format
  - Versioned schema

---

## Phase 4: Advanced Features

> **Goal**: Production-ready features for real-world usage.

### 4.1 Structured Text Support

- [ ] Markdown-aware merging:
  - Preserve header hierarchy
  - Handle list item changes
  - Code block preservation
- [ ] Section-based merging:
  - Align by section headers
  - Merge within sections independently
- [ ] YAML/JSON frontmatter handling

### 4.2 Conflict Resolution

- [ ] Implement conflict markers:
  ```
  <<<<<<< BASE
  Original text from base
  =======
  User's customized text
  >>>>>>> USER
  ```
- [ ] Implement resolver interface:
  - Allow pluggable resolvers
  - Built-in: prefer-base, prefer-user, concatenate
- [ ] Streaming/interactive resolution:
  - Yield conflicts as they're found
  - Accept resolutions incrementally

### 4.3 Performance Optimization

- [ ] Lazy embedding computation:
  - Only embed when needed
  - Skip embedding for identical content
- [ ] Batch embedding:
  - Process multiple texts in one call
- [ ] Early termination:
  - Skip alignment for identical documents
  - Fast path for no-conflict cases
- [ ] WASM embedding option:
  - For browser environments
  - Consider onnxruntime-web

### 4.4 CLI Tool

- [ ] Implement `betterprompt` CLI:
  - `betterprompt diff <base> <modified>` - Show edits
  - `betterprompt patch <base> <modified> -o patch.json` - Generate patch
  - `betterprompt apply <new-base> <patch.json>` - Apply patch
  - `betterprompt merge <base-v1> <base-v2> <user>` - Three-way merge
- [ ] Support stdin/stdout for piping
- [ ] Output formats: text, json, diff-style

---

## Phase 5: Testing & Validation

> **Goal**: Comprehensive test coverage and real-world validation.

### 5.1 Unit Tests

- [ ] Segmentation tests:
  - Various sentence structures
  - Edge cases (abbreviations, URLs, numbers)
  - Unicode and multi-language
- [ ] Alignment tests:
  - Identical texts
  - Insertions/deletions
  - Reordering
  - Partial matches
- [ ] Merge tests:
  - Each merge mode
  - Conflict detection
  - Subsumption detection

### 5.2 Integration Tests

- [ ] End-to-end merge scenarios:
  - Prompt upgrade with customizations
  - Multiple conflict resolution
  - Large document handling
- [ ] Patch round-trip:
  - Generate patch → apply to new base → verify

### 5.3 Real-World Test Cases

- [ ] Create test corpus:
  - System prompts (LLM instructions)
  - Documentation sections
  - Configuration files (YAML/JSON with comments)
  - Legal/policy text
- [ ] Benchmark against:
  - Git text merge (baseline)
  - Manual merge (gold standard)

### 5.4 Performance Benchmarks

- [ ] Measure:
  - Time to merge (varying document sizes)
  - Memory usage
  - Embedding computation overhead
- [ ] Set performance budgets
- [ ] Track regressions in CI

---

## Phase 6: Documentation & Examples

### 6.1 Usage Examples

- [ ] Basic merge example
- [ ] Prompt upgrade workflow:

  ```typescript
  // When user first customizes
  const patch = generatePatch(baseV1, userCustom);
  savePatch(patch);

  // When base is upgraded
  const newBase = fetchNewBase();
  const result = applyPatch(newBase, patch);
  ```

- [ ] Conflict handling patterns
- [ ] Custom embedding provider
- [ ] Custom resolver integration

### 6.2 Integration Guides

- [ ] Node.js library usage
- [ ] Browser usage (with bundler)
- [ ] CLI usage
- [ ] CI/CD integration (automated prompt upgrades)

---

## Out of Scope (Extension Points Only)

The following are explicitly out of scope for the core library, but interfaces are provided:

- [ ] **LLM-assisted conflict resolution**: Define interface, no implementation
- [ ] **LLM-assisted "best of both"**: Define interface, no implementation
- [ ] **Edit intent classification**: Use heuristics, not ML models
- [ ] **Grammar/quality improvement**: Not a goal; preserve user intent exactly
- [ ] **Translation/localization**: Single-language merging only

---

## Research References

Key papers and resources that informed this design:

1. **WikiAtomicEdits** (Faruqui et al., 2018) - 43M atomic edits corpus
   - https://github.com/google-research-datasets/wiki-atomic-edits

2. **Text-Editing Models Tutorial** (NAACL 2022)
   - https://text-editing.github.io/

3. **Neural CRF for Sentence Alignment** (Jiang et al., 2020)
   - https://aclanthology.org/2020.acl-main.709/

4. **Learning to Represent Edits** (Yin et al., ICLR 2019)
   - https://arxiv.org/abs/1810.13337

5. **Wikipedia Edit Intention Classification** (Yang et al., 2017)
   - https://aclanthology.org/D17-1213/

6. **Darcs Patch Theory** - Mathematical foundation for patch commutation
   - https://en.wikibooks.org/wiki/Understanding_Darcs/Patch_theory

7. **Sentence Fusion** - Combining multiple sources
   - https://paperswithcode.com/task/sentence-fusion

---

## Success Criteria

The project is successful when:

1. **Deterministic merging** works without any LLM or external API
2. **User customizations survive** base upgrades automatically
3. **Conflicts are detected** reliably and reported clearly
4. **Performance is acceptable** (<100ms for typical prompt sizes)
5. **The algorithm is language-agnostic** (works for any natural language)
6. **Extension points exist** for LLM-assisted resolution (but are not required)
