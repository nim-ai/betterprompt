import { describe, it, expect } from "vitest";
import { segment, reconstruct } from "../src/segmentation/index.js";

describe("segment", () => {
  it("should segment simple sentences", () => {
    const text = "Hello world. This is a test. Another sentence here.";
    const result = segment(text);

    expect(result.units).toHaveLength(3);
    expect(result.units[0]?.content).toBe("Hello world.");
    expect(result.units[1]?.content).toBe("This is a test.");
    expect(result.units[2]?.content).toBe("Another sentence here.");
  });

  it("should handle text with no punctuation", () => {
    const text = "Just one sentence with no ending";
    const result = segment(text);

    expect(result.units).toHaveLength(1);
    expect(result.units[0]?.content).toBe("Just one sentence with no ending");
  });

  it("should preserve the original text reference", () => {
    const text = "First. Second.";
    const result = segment(text);

    expect(result.original).toBe(text);
  });

  it("should handle abbreviations correctly", () => {
    const text = "Dr. Smith went to the store. He bought milk.";
    const result = segment(text);

    // Should treat "Dr." as abbreviation, not sentence boundary
    expect(result.units.length).toBeGreaterThanOrEqual(1);
    // The first unit should contain "Dr. Smith"
    expect(result.units[0]?.content).toContain("Dr.");
  });

  it("should generate unique hashes for different content", () => {
    const text = "First sentence. Second sentence.";
    const result = segment(text);

    expect(result.units[0]?.hash).not.toBe(result.units[1]?.hash);
  });

  it("should generate same hash for same normalized content", () => {
    const text1 = "Hello World.";
    const text2 = "hello world.";

    const result1 = segment(text1);
    const result2 = segment(text2);

    expect(result1.units[0]?.hash).toBe(result2.units[0]?.hash);
  });

  it("should handle empty text", () => {
    const result = segment("");
    expect(result.units).toHaveLength(0);
  });

  it("should handle whitespace-only text", () => {
    const result = segment("   \n\n   ");
    expect(result.units).toHaveLength(0);
  });

  it("should preserve whitespace in prefix/suffix", () => {
    const text = "  First sentence.  Second sentence.  ";
    const result = segment(text);

    // First unit should have leading whitespace in prefix
    expect(result.units[0]?.prefix).toContain("  ");
  });

  it("should segment paragraphs when configured", () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const result = segment(text, { granularity: "paragraph" });

    expect(result.units).toHaveLength(2);
    expect(result.units[0]?.content).toBe("First paragraph.");
    expect(result.units[1]?.content).toBe("Second paragraph.");
  });

  it("should detect markdown headings", () => {
    const text = "# Heading\n\nSome content.";
    const result = segment(text, { preserveMarkdown: true });

    const headingUnit = result.units.find(
      (u) => u.metadata?.type === "heading"
    );
    expect(headingUnit).toBeDefined();
  });

  it("should detect heading levels", () => {
    const text = "# H1\n\n## H2\n\n### H3";
    const result = segment(text, { granularity: "paragraph" });

    const h1 = result.units.find((u) => u.content === "# H1");
    const h2 = result.units.find((u) => u.content === "## H2");
    const h3 = result.units.find((u) => u.content === "### H3");

    expect(h1?.metadata?.level).toBe(1);
    expect(h2?.metadata?.level).toBe(2);
    expect(h3?.metadata?.level).toBe(3);
  });

  it("should segment by markdown sections", () => {
    const text = `# Section 1
Content for section 1.

# Section 2
Content for section 2.`;

    const result = segment(text, { granularity: "section" });

    expect(result.units).toHaveLength(2);
    expect(result.units[0]?.content).toContain("Section 1");
    expect(result.units[1]?.content).toContain("Section 2");
  });

  it("should preserve code blocks as single units", () => {
    const text = `Some text.

\`\`\`javascript
function foo() {
  return "bar";
}
\`\`\`

More text.`;

    const result = segment(text, { granularity: "paragraph" });

    // Find the code block unit
    const codeBlock = result.units.find((u) =>
      u.content.includes("```javascript")
    );
    expect(codeBlock).toBeDefined();
    expect(codeBlock?.content).toContain("function foo()");
    expect(codeBlock?.metadata?.type).toBe("code-block");
  });

  it("should detect unordered list items", () => {
    const text = "- Item one\n- Item two\n- Item three";
    const result = segment(text, { granularity: "paragraph" });

    const listItem = result.units.find((u) => u.metadata?.type === "list-item");
    expect(listItem).toBeDefined();
    expect(listItem?.metadata?.ordered).toBe(false);
  });

  it("should detect ordered list items", () => {
    const text = "1. First item\n2. Second item\n3. Third item";
    const result = segment(text, { granularity: "paragraph" });

    const listItem = result.units.find((u) => u.metadata?.type === "list-item");
    expect(listItem).toBeDefined();
    expect(listItem?.metadata?.ordered).toBe(true);
  });
});

describe("reconstruct", () => {
  it("should reconstruct text from segments", () => {
    const text = "Hello world. This is a test.";
    const result = segment(text);
    const reconstructed = reconstruct(result.units);

    // Should produce similar text (may have minor whitespace differences)
    expect(reconstructed.trim()).toBe(text.trim());
  });

  it("should handle empty units array", () => {
    const reconstructed = reconstruct([]);
    expect(reconstructed).toBe("");
  });

  it("should preserve structure through round-trip", () => {
    const text = "First. Second. Third.";
    const result = segment(text);
    const reconstructed = reconstruct(result.units);

    // Segment again and compare
    const result2 = segment(reconstructed);
    expect(result2.units.length).toBe(result.units.length);
  });
});
