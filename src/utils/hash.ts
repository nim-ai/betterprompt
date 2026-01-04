/**
 * Hashing utilities for content-addressable identity.
 */

/**
 * Create a simple hash of a string.
 * Uses a fast, non-cryptographic hash for semantic identity.
 */
export function createHash(input: string): string {
  // FNV-1a hash - fast and good distribution
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  // Convert to hex string
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Create a hash that includes position context.
 * Useful for disambiguation when content is duplicated.
 */
export function createContextualHash(
  content: string,
  before: string,
  after: string
): string {
  const combined = `${before.slice(-50)}|${content}|${after.slice(0, 50)}`;
  return createHash(combined);
}

/**
 * Compare two hashes for equality.
 */
export function hashesEqual(a: string, b: string): boolean {
  return a === b;
}
