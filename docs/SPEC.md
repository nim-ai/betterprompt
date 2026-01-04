# betterprompt Specification

Language-agnostic algorithm for intelligently merging and upgrading natural language text, treating edits as first-class semantic operations.

## Overview

### Core Principle

Model user edits as _transformations_ (patches), not final states. When the base upgrades, replay transformations on the new base.

### Design Goals

1. **Deterministic merging** without any LLM or external API
2. **User customizations survive** base upgrades automatically
3. **Conflicts are detected** reliably and reported clearly
4. **Performance is acceptable** (<100ms for typical prompt sizes)
5. **Language-agnostic** (works for any natural language)
6. **Extension points exist** for LLM-assisted resolution (optional)

---

## 1. Text Decomposition Model

### 1.1 Segmentation Granularity

Text is decomposed into semantic units at configurable granularity:

| Level    | Description                                    |
| -------- | ---------------------------------------------- |
| Document | Complete text                                  |
| Section  | Headers, paragraphs (separated by blank lines) |
| Sentence | Individual sentences (primary unit)            |
| Clause   | Sub-sentence phrases (optional, fine-grained)  |

### 1.2 Sentence Boundary Detection

Rule-based approach handling:

- Standard punctuation (. ! ?)
- Abbreviations (Mr., Dr., etc., i.e., e.g.)
- Decimal numbers
- URLs and special patterns

### 1.3 Semantic Unit Structure

```typescript
interface SemanticUnit {
  content: string; // The text content
  hash: string; // Content-addressable identity
  index: number; // Position in source
  start: number; // Character offset start
  end: number; // Character offset end
  prefix: string; // Preserved whitespace before
  suffix: string; // Preserved whitespace after
  metadata?: {
    // Optional structure info
    type?: "heading" | "list-item" | "code-block";
  };
}
```

### 1.4 Formatting Preservation

- Whitespace and line breaks are captured in `prefix`/`suffix`
- Markdown structure is detected and preserved
- Original formatting can be reconstructed

---

## 2. Semantic Identity & Similarity

### 2.1 Content-Addressable Hashing

Each semantic unit has a stable hash based on normalized content:

1. Convert to lowercase
2. Collapse whitespace
3. Remove punctuation
4. Generate hash

### 2.2 Embedding-Based Similarity

For semantic comparison, sentence embeddings are used:

| Provider | Model          | Dimension | Size   |
| -------- | -------------- | --------- | ------ |
| Default  | Model2Vec      | 256       | 7.5 MB |
| Fallback | Char-frequency | 128       | 0 KB   |

The Model2Vec model is bundled with the package (no runtime downloads). It uses the tokenizer from BAAI/bge-base-en-v1.5. Both are MIT licensed.

**Why ML Embeddings?** The ML model's key advantage is discrimination: it gives low similarity scores for unrelated content. The character-frequency fallback gives high scores (~0.75) to any English text due to common letter distributions. ML embeddings maintain a 6x larger gap between similar and unrelated content, enabling more accurate sentence alignment.

### 2.3 Similarity Classification

| Classification | Threshold | Meaning                         |
| -------------- | --------- | ------------------------------- |
| IDENTICAL      | 1.0       | Exact match after normalization |
| EQUIVALENT     | > 0.95    | Same meaning, different words   |
| SIMILAR        | > 0.80    | Related content                 |
| DIFFERENT      | < 0.80    | Unrelated content               |

### 2.4 Extensibility

Custom embedding providers can be plugged in:

```typescript
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimension: number;
  readonly name: string;
}
```

---

## 3. Alignment Algorithm

### 3.1 Three-Way Alignment

Two alignments are computed:

1. A ↔ B (upstream changes from original to upgraded)
2. A ↔ C (user modifications from original)

### 3.2 Alignment Strategies

| Strategy   | Description                                    |
| ---------- | ---------------------------------------------- |
| Sequential | Preserves order, uses dynamic programming      |
| Semantic   | Matches by meaning, ignores order              |
| Hybrid     | Sequential primary, semantic for moved content |

### 3.3 Alignment Pair Types

| Type         | Source | Target | Meaning                                               |
| ------------ | ------ | ------ | ----------------------------------------------------- |
| match        | unit   | unit   | Units correspond (may have same or different content) |
| modification | unit   | unit   | Units correspond with low similarity                  |
| insertion    | null   | unit   | New content in target                                 |
| deletion     | unit   | null   | Content removed from source                           |

### 3.4 Dynamic Programming Alignment

For sequential alignment, a DP approach is used:

- Match score: similarity if above threshold, else penalty
- Delete/insert score: small penalty
- Backtrack to find optimal alignment

---

## 4. Edit Operations

### 4.1 Edit Taxonomy

| Operation | Description                          |
| --------- | ------------------------------------ |
| KEEP      | No change                            |
| INSERT    | Add new content                      |
| DELETE    | Remove content                       |
| REPLACE   | Substitute content (DELETE + INSERT) |
| MOVE      | Reposition content                   |

### 4.2 Edit Structure

```typescript
interface Edit {
  operation: "KEEP" | "INSERT" | "DELETE" | "REPLACE" | "MOVE";
  anchor: string; // Hash of original content
  anchorContext?: {
    // Fallback matching context
    before: string;
    after: string;
  };
  oldContent?: string; // For DELETE, REPLACE
  newContent?: string; // For INSERT, REPLACE
  position?: "before" | "after" | "replace";
  confidence: number; // Applicability confidence
}
```

### 4.3 Edit Extraction

Edits are extracted by comparing aligned pairs:

1. Match with identical content → KEEP
2. Match with different content → REPLACE
3. Deletion → DELETE
4. Insertion → INSERT

---

## 5. Merge Algorithm

### 5.1 Three-Way Merge Logic

Three inputs:

- **A** (original base): The starting point
- **B** (upgraded base): New version of the base
- **C** (user custom): User's modifications to A

For each unit in A, determine what happened:

| A→B change | A→C change | Result                |
| ---------- | ---------- | --------------------- |
| unchanged  | unchanged  | Use B                 |
| changed    | unchanged  | Use B (upgrade)       |
| unchanged  | changed    | Use C (preserve user) |
| changed    | changed    | **CONFLICT**          |

### 5.2 Merge Modes

| Mode     | Behavior                                                   |
| -------- | ---------------------------------------------------------- |
| upgrade  | Prefer base upgrades, preserve user customizations         |
| preserve | Prefer user customizations, apply non-conflicting upgrades |
| combine  | Include content from both (may produce conflicts)          |

### 5.3 Conflict Resolution Strategies

When both B (upgraded base) and C (user customized) change the same content from A (original):

| Strategy    | Behavior                                       |
| ----------- | ---------------------------------------------- |
| prefer-c    | Automatically choose C's version — **default** |
| prefer-b    | Automatically choose B's version (upgraded)    |
| prefer-a    | Automatically choose A's version (original)    |
| defer       | Mark for manual/external resolution            |
| concatenate | Include both versions                          |

### 5.4 Subsumption Detection

Before flagging a conflict, check if one version subsumes the other:

- If B semantically contains C's change → use B
- If C contains B's change → use C
- Uses embedding similarity, not LLM

### 5.5 Merge Result

```typescript
interface MergeResult {
  merged: string; // Final merged text
  conflicts: Conflict[]; // Unresolved conflicts
  resolutions: Resolution[]; // Applied resolutions
  stats: {
    unchanged: number;
    upgraded: number;
    preserved: number;
    conflicts: number;
    autoResolved: number;
  };
}
```

---

## 6. Patch Format

### 6.1 Patch Structure

```typescript
interface Patch {
  version: string; // Format version
  baseHash: string; // Hash of original base
  createdAt: string; // ISO timestamp
  edits: Edit[]; // Ordered edits
  metadata?: Record<string, unknown>;
}
```

### 6.2 Patch Application

1. Find anchor in new base (exact → semantic → context-based)
2. Apply operation
3. Track success/failure per edit

### 6.3 Application Result

```typescript
interface PatchApplicationResult {
  result: string; // Resulting text
  applied: Edit[]; // Successfully applied
  failed: Edit[]; // Failed to apply
  adapted: Edit[]; // Applied with adaptation
}
```

---

## 7. Extension Points

### 7.1 Conflict Resolver Interface

```typescript
interface ConflictResolver {
  resolve(conflict: Conflict): Promise<Resolution>;
  resolveBatch?(conflicts: Conflict[]): Promise<Resolution[]>;
}
```

### 7.2 Integration Patterns

- **LLM resolver**: Call external LLM for intelligent merging
- **Human-in-the-loop**: Yield conflicts for manual resolution
- **Rule-based**: Custom business logic

### 7.3 When to Invoke External Resolver

- Semantic similarity below threshold
- Both versions have significant unique content
- Structural incompatibility

---

## 8. Conflict Markers

When conflicts cannot be auto-resolved (strategy: `defer`), markers are inserted:

```
<<<<<<< B
Content from upgraded base (B)
=======
Content from user version (C)
>>>>>>> C
```

---

## References

1. **WikiAtomicEdits** (Faruqui et al., 2018) - Atomic edits corpus
2. **Neural CRF for Sentence Alignment** (Jiang et al., 2020)
3. **Darcs Patch Theory** - Mathematical foundation for patches
4. **Sentence Transformers** - Embedding models for similarity
