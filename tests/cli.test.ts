/**
 * CLI tests for betterprompt.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Helper to run CLI and capture output
async function runCli(
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn("node", ["./dist/cli.js", ...args], {
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

// Test fixtures directory
let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `betterprompt-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("CLI", () => {
  describe("help and version", () => {
    it("should show help with --help", async () => {
      const { stdout, code } = await runCli(["--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("betterprompt");
      expect(stdout).toContain("USAGE:");
      expect(stdout).toContain("COMMANDS:");
    });

    it("should show help with -h", async () => {
      const { stdout, code } = await runCli(["-h"]);
      expect(code).toBe(0);
      expect(stdout).toContain("betterprompt");
    });

    it("should show version with --version", async () => {
      const { stdout, code } = await runCli(["--version"]);
      expect(code).toBe(0);
      expect(stdout).toContain("betterprompt v");
    });

    it("should show version with -v", async () => {
      const { stdout, code } = await runCli(["-v"]);
      expect(code).toBe(0);
      expect(stdout).toContain("betterprompt v");
    });

    it("should show help when no command given", async () => {
      const { stdout, code } = await runCli([]);
      expect(code).toBe(1);
      expect(stdout).toContain("USAGE:");
    });

    it("should error on unknown command", async () => {
      const { stderr, code } = await runCli(["unknown"]);
      expect(code).toBe(1);
      expect(stderr).toContain("Unknown command");
    });
  });

  describe("diff command", () => {
    it("should show diff between two files", async () => {
      const file1 = join(testDir, "base.txt");
      const file2 = join(testDir, "modified.txt");
      await writeFile(file1, "Hello world.");
      await writeFile(file2, "Hello universe.");

      const { stdout, code } = await runCli(["diff", file1, file2, "--no-ml"]);
      expect(code).toBe(0);
      expect(stdout).toContain("Diff:");
      expect(stdout).toContain("Summary:");
    });

    it("should output JSON with --format json", async () => {
      const file1 = join(testDir, "base.txt");
      const file2 = join(testDir, "modified.txt");
      await writeFile(file1, "Hello world.");
      await writeFile(file2, "Hello universe.");

      const { stdout, code } = await runCli([
        "diff",
        file1,
        file2,
        "--format",
        "json",
        "--no-ml",
      ]);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("edits");
    });

    it("should error when files are missing", async () => {
      const { stderr, code } = await runCli(["diff", "only-one-file.txt"]);
      expect(code).toBe(1);
      expect(stderr).toContain("diff requires two files");
    });

    it("should write to output file with -o", async () => {
      const file1 = join(testDir, "base.txt");
      const file2 = join(testDir, "modified.txt");
      const outFile = join(testDir, "diff-out.txt");
      await writeFile(file1, "Hello world.");
      await writeFile(file2, "Hello universe.");

      const { stderr, code } = await runCli([
        "diff",
        file1,
        file2,
        "-o",
        outFile,
        "--no-ml",
      ]);
      expect(code).toBe(0);
      expect(stderr).toContain("Written to:");
    });
  });

  describe("patch command", () => {
    it("should generate a patch", async () => {
      const file1 = join(testDir, "base.txt");
      const file2 = join(testDir, "modified.txt");
      await writeFile(file1, "Hello world.");
      await writeFile(file2, "Hello universe.");

      const { stdout, code } = await runCli(["patch", file1, file2, "--no-ml"]);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("version");
      expect(result).toHaveProperty("edits");
    });

    it("should write patch to file with -o", async () => {
      const file1 = join(testDir, "base.txt");
      const file2 = join(testDir, "modified.txt");
      const outFile = join(testDir, "patch.json");
      await writeFile(file1, "Hello world.");
      await writeFile(file2, "Hello universe.");

      const { stderr, code } = await runCli([
        "patch",
        file1,
        file2,
        "-o",
        outFile,
        "--no-ml",
      ]);
      expect(code).toBe(0);
      expect(stderr).toContain("Written to:");
    });

    it("should error when files are missing", async () => {
      const { stderr, code } = await runCli(["patch", "only-one-file.txt"]);
      expect(code).toBe(1);
      expect(stderr).toContain("patch requires two files");
    });
  });

  describe("apply command", () => {
    it("should apply a patch", async () => {
      const baseFile = join(testDir, "base.txt");
      const modifiedFile = join(testDir, "modified.txt");
      const patchFile = join(testDir, "patch.json");

      await writeFile(baseFile, "Hello world.");
      await writeFile(modifiedFile, "Hello universe.");

      // First generate a patch
      const { stdout: patchOut } = await runCli([
        "patch",
        baseFile,
        modifiedFile,
        "--no-ml",
      ]);

      await writeFile(patchFile, patchOut);

      // Apply it to a new base
      const newBaseFile = join(testDir, "new-base.txt");
      await writeFile(newBaseFile, "Hello world.");

      const { stdout, code } = await runCli([
        "apply",
        newBaseFile,
        patchFile,
        "--no-ml",
      ]);
      expect(code).toBe(0);
      expect(stdout).toContain("universe");
    });

    it("should output JSON with --format json", async () => {
      const baseFile = join(testDir, "base.txt");
      const modifiedFile = join(testDir, "modified.txt");
      const patchFile = join(testDir, "patch.json");

      await writeFile(baseFile, "Hello world.");
      await writeFile(modifiedFile, "Hello universe.");

      const { stdout: patchOut } = await runCli([
        "patch",
        baseFile,
        modifiedFile,
        "--no-ml",
      ]);
      await writeFile(patchFile, patchOut);

      const { stdout, code } = await runCli([
        "apply",
        baseFile,
        patchFile,
        "--format",
        "json",
        "--no-ml",
      ]);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("result");
      expect(result).toHaveProperty("applied");
    });

    it("should error when files are missing", async () => {
      const { stderr, code } = await runCli(["apply", "only-one-file.txt"]);
      expect(code).toBe(1);
      expect(stderr).toContain("apply requires two files");
    });
  });

  describe("merge command", () => {
    it("should perform three-way merge", async () => {
      const v1 = join(testDir, "v1.txt");
      const v2 = join(testDir, "v2.txt");
      const user = join(testDir, "user.txt");

      await writeFile(v1, "Hello world.");
      await writeFile(v2, "Hello universe.");
      await writeFile(user, "Hello world. Welcome!");

      const { stderr, code } = await runCli(["merge", v1, v2, user, "--no-ml"]);
      expect(code).toBe(0);
      expect(stderr).toContain("Merge complete");
    });

    it("should output JSON with --format json", async () => {
      const v1 = join(testDir, "v1.txt");
      const v2 = join(testDir, "v2.txt");
      const user = join(testDir, "user.txt");

      await writeFile(v1, "Hello world.");
      await writeFile(v2, "Hello universe.");
      await writeFile(user, "Hello world. Welcome!");

      const { stdout, code } = await runCli([
        "merge",
        v1,
        v2,
        user,
        "--format",
        "json",
        "--no-ml",
      ]);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("merged");
      expect(result).toHaveProperty("stats");
    });

    it("should accept --mode option", async () => {
      const v1 = join(testDir, "v1.txt");
      const v2 = join(testDir, "v2.txt");
      const user = join(testDir, "user.txt");

      await writeFile(v1, "Hello world.");
      await writeFile(v2, "Hello universe.");
      await writeFile(user, "Hello world. Welcome!");

      const { code } = await runCli([
        "merge",
        v1,
        v2,
        user,
        "--mode",
        "preserve",
        "--no-ml",
      ]);
      expect(code).toBe(0);
    });

    it("should accept --strategy option", async () => {
      const v1 = join(testDir, "v1.txt");
      const v2 = join(testDir, "v2.txt");
      const user = join(testDir, "user.txt");

      await writeFile(v1, "Hello world.");
      await writeFile(v2, "Hello universe.");
      await writeFile(user, "Hello world. Welcome!");

      const { code } = await runCli([
        "merge",
        v1,
        v2,
        user,
        "--strategy",
        "prefer-c",
        "--no-ml",
      ]);
      expect(code).toBe(0);
    });

    it("should write to output file with -o", async () => {
      const v1 = join(testDir, "v1.txt");
      const v2 = join(testDir, "v2.txt");
      const user = join(testDir, "user.txt");
      const outFile = join(testDir, "merged.txt");

      await writeFile(v1, "Hello world.");
      await writeFile(v2, "Hello universe.");
      await writeFile(user, "Hello world. Welcome!");

      const { stderr, code } = await runCli([
        "merge",
        v1,
        v2,
        user,
        "-o",
        outFile,
        "--no-ml",
      ]);
      expect(code).toBe(0);
      expect(stderr).toContain("Written to:");
    });

    it("should error when files are missing", async () => {
      const { stderr, code } = await runCli(["merge", "v1.txt", "v2.txt"]);
      expect(code).toBe(1);
      expect(stderr).toContain("merge requires three files");
    });
  });

  describe("--no-ml flag", () => {
    it("should work with diff command", async () => {
      const file1 = join(testDir, "base.txt");
      const file2 = join(testDir, "modified.txt");
      await writeFile(file1, "Hello world.");
      await writeFile(file2, "Hello universe.");

      const { code } = await runCli(["diff", file1, file2, "--no-ml"]);
      expect(code).toBe(0);
    });

    it("should work with merge command", async () => {
      const v1 = join(testDir, "v1.txt");
      const v2 = join(testDir, "v2.txt");
      const user = join(testDir, "user.txt");

      await writeFile(v1, "Hello world.");
      await writeFile(v2, "Hello universe.");
      await writeFile(user, "Hello world. Welcome!");

      const { code } = await runCli(["merge", v1, v2, user, "--no-ml"]);
      expect(code).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should handle non-existent files", async () => {
      const { stderr, code } = await runCli([
        "diff",
        "/nonexistent/file1.txt",
        "/nonexistent/file2.txt",
      ]);
      expect(code).toBe(1);
      expect(stderr).toContain("Error:");
    });
  });
});
