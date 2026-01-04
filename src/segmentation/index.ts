/**
 * Text segmentation module.
 * Breaks text into semantic units (sentences, paragraphs, etc.)
 */

import type {
  SemanticUnit,
  SegmentationResult,
  SegmentationOptions,
} from "../types/index.js";
import { createHash } from "../utils/hash.js";

/**
 * Default sentence boundary pattern.
 * Handles common abbreviations, decimals, and edge cases.
 */
const SENTENCE_BOUNDARY =
  /(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])(?=\s*$)|(?<=\n\n)/g;

/**
 * Abbreviations that should not be treated as sentence boundaries.
 */
const ABBREVIATIONS = new Set([
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "Sr.",
  "Jr.",
  "vs.",
  "etc.",
  "i.e.",
  "e.g.",
  "cf.",
  "al.",
  "Fig.",
  "fig.",
  "Vol.",
  "vol.",
  "No.",
  "no.",
  "pp.",
  "p.",
]);

/**
 * Normalize text for hashing (consistent identity).
 */
function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

/**
 * Extract leading/trailing whitespace from a string.
 */
function extractWhitespace(text: string): {
  prefix: string;
  content: string;
  suffix: string;
} {
  const prefixMatch = text.match(/^(\s*)/);
  const suffixMatch = text.match(/(\s*)$/);
  const prefix = prefixMatch?.[1] ?? "";
  const suffix = suffixMatch?.[1] ?? "";
  const content = text.slice(prefix.length, text.length - suffix.length);
  return { prefix, content, suffix };
}

/**
 * Split text into sentences using rule-based approach.
 */
function splitSentences(text: string): string[] {
  // Simple approach: split on sentence boundaries
  // Then filter out empty strings and merge with context
  const parts = text.split(SENTENCE_BOUNDARY).filter((s) => s.trim());

  // Handle abbreviations by merging back incorrectly split sentences
  const sentences: string[] = [];
  let buffer = "";

  for (const part of parts) {
    buffer += (buffer ? " " : "") + part;

    // Check if this ends with a standalone abbreviation (not part of another word)
    const trimmedBuffer = buffer.trimEnd();
    const endsWithAbbr = Array.from(ABBREVIATIONS).some((abbr) => {
      if (!trimmedBuffer.endsWith(abbr)) return false;
      // Make sure it's a standalone abbreviation, not part of a word
      const beforeAbbr = trimmedBuffer.slice(0, -abbr.length);
      // It's standalone if: at start, or preceded by space/punctuation
      return beforeAbbr.length === 0 || /[\s,;:(]$/.test(beforeAbbr);
    });

    if (!endsWithAbbr) {
      sentences.push(buffer);
      buffer = "";
    }
  }

  if (buffer) {
    sentences.push(buffer);
  }

  return sentences;
}

/**
 * Split text into paragraphs.
 */
function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).filter((p) => p.trim());
}

/**
 * Split markdown into sections based on headers.
 * Each section includes the header and its content until the next header.
 */
function splitMarkdownSections(text: string): string[] {
  const sections: string[] = [];
  const lines = text.split("\n");
  let currentSection: string[] = [];

  for (const line of lines) {
    // Check if this is a header line
    if (/^#{1,6}\s/.test(line) && currentSection.length > 0) {
      // Start new section, save current
      sections.push(currentSection.join("\n"));
      currentSection = [line];
    } else {
      currentSection.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection.length > 0) {
    const content = currentSection.join("\n").trim();
    if (content) {
      sections.push(content);
    }
  }

  return sections;
}

/**
 * Split text while preserving code blocks as single units.
 */
function splitPreservingCodeBlocks(
  text: string,
  splitter: (text: string) => string[]
): string[] {
  const codeBlockPattern = /```[\s\S]*?```/g;
  const codeBlocks: string[] = [];
  const placeholder = "\u0000CODE_BLOCK_";

  // Extract code blocks
  let processedText = text.replace(codeBlockPattern, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `${placeholder}${idx}\u0000`;
  });

  // Split the text
  const parts = splitter(processedText);

  // Restore code blocks
  return parts.map((part) => {
    return part.replace(
      new RegExp(`${placeholder}(\\d+)\u0000`, "g"),
      (_, idx) => codeBlocks[parseInt(idx, 10)] ?? ""
    );
  });
}

/**
 * Segment text into semantic units.
 */
export function segment(
  text: string,
  options: SegmentationOptions = {}
): SegmentationResult {
  const { granularity = "sentence", preserveMarkdown = true } = options;

  const units: SemanticUnit[] = [];
  let currentOffset = 0;

  // Choose splitting strategy based on granularity
  let splitter: (text: string) => string[];
  switch (granularity) {
    case "section":
      splitter = splitMarkdownSections;
      break;
    case "paragraph":
      splitter = splitParagraphs;
      break;
    case "sentence":
    default:
      splitter = splitSentences;
      break;
  }

  // Preserve code blocks as single units when processing markdown
  const rawParts = preserveMarkdown
    ? splitPreservingCodeBlocks(text, splitter)
    : splitter(text);

  for (let i = 0; i < rawParts.length; i++) {
    const raw = rawParts[i];
    if (!raw) continue;

    // Find this part in the original text
    const idx = text.indexOf(raw, currentOffset);
    if (idx === -1) continue;

    const { prefix, content, suffix } = extractWhitespace(raw);
    const normalizedContent = content.trim();

    if (!normalizedContent) continue;

    const unit: SemanticUnit = {
      content: normalizedContent,
      hash: createHash(normalizeForHash(normalizedContent)),
      index: units.length,
      start: idx,
      end: idx + raw.length,
      prefix: text.slice(currentOffset, idx) + prefix,
      suffix,
    };

    // Add markdown metadata if applicable
    if (preserveMarkdown) {
      if (/^#{1,6}\s/.test(normalizedContent)) {
        // Extract heading level
        const match = normalizedContent.match(/^(#+)/);
        const level = match?.[1]?.length ?? 1;
        unit.metadata = { type: "heading", level };
      } else if (/^[-*+]\s/.test(normalizedContent)) {
        unit.metadata = { type: "list-item", ordered: false };
      } else if (/^\d+\.\s/.test(normalizedContent)) {
        unit.metadata = { type: "list-item", ordered: true };
      } else if (normalizedContent.startsWith("```")) {
        unit.metadata = { type: "code-block" };
      }
    }

    units.push(unit);
    currentOffset = idx + raw.length;
  }

  // Preserve trailing whitespace from original text in the last unit's suffix
  if (units.length > 0 && currentOffset < text.length) {
    const lastUnit = units[units.length - 1]!;
    lastUnit.suffix += text.slice(currentOffset);
  }

  return {
    units,
    original: text,
  };
}

/**
 * Reconstruct text from semantic units.
 * Ensures proper spacing between units when concatenating from different sources.
 */
export function reconstruct(units: SemanticUnit[]): string {
  if (units.length === 0) return "";

  let result = "";
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!;

    // Ensure spacing between units when neither has whitespace at the boundary
    if (i > 0 && result.length > 0) {
      const prevSuffix = units[i - 1]!.suffix;
      const hasSpacing = /\s/.test(prevSuffix) || /\s/.test(unit.prefix);
      if (!hasSpacing) {
        result += " ";
      }
    }

    result += unit.prefix + unit.content + unit.suffix;
  }
  return result;
}

export type { SemanticUnit, SegmentationResult, SegmentationOptions };
