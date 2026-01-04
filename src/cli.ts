/**
 * betterprompt CLI
 *
 * Commands:
 *   diff <base> <modified>              Show differences between two texts
 *   patch <base> <modified> -o <file>   Generate a patch file
 *   apply <base> <patch>                Apply a patch to a base text
 *   merge <base-v1> <base-v2> <user>    Three-way merge
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  diff,
  summarizeDiff,
  generatePatch,
  applyPatch,
  serializePatch,
  deserializePatch,
  merge,
  setDefaultProvider,
  CharFrequencyEmbeddingProvider,
} from "./index.js";

const VERSION = "0.1.0";

interface CliOptions {
  output?: string;
  format?: "text" | "json";
  strategy?: "defer" | "prefer-a" | "prefer-b" | "prefer-c" | "concatenate";
  help?: boolean;
  version?: boolean;
  noMl?: boolean;
}

function printHelp(): void {
  console.log(`
betterprompt v${VERSION}
Language-agnostic algorithm for merging natural language text

USAGE:
  betterprompt <command> [options] [arguments]

COMMANDS:
  diff <base> <modified>
      Show differences between two text files

  patch <base> <modified> [-o <file>]
      Generate a patch file from base to modified
      -o, --output <file>   Output file (default: stdout)

  apply <base> <patch>
      Apply a patch file to a base text

  merge <base-v1> <base-v2> <user> [-o <file>]
      Three-way merge of text files
      -o, --output <file>   Output file (default: stdout)
      -s, --strategy <s>    Conflict strategy: defer|prefer-a|prefer-b|prefer-c|concatenate

OPTIONS:
  -f, --format <fmt>   Output format: text|json (default: text)
  --no-ml              Use char-frequency similarity (no ML model)
  -h, --help           Show this help message
  -v, --version        Show version number

EXAMPLES:
  betterprompt diff original.txt modified.txt
  betterprompt patch base.txt custom.txt -o my-patch.json
  betterprompt apply new-base.txt my-patch.json
  betterprompt merge v1.txt v2.txt custom.txt -o merged.txt
`);
}

function parseArgs(args: string[]): {
  command: string;
  files: string[];
  options: CliOptions;
} {
  const options: CliOptions = {};
  const files: string[] = [];
  let command = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "-v" || arg === "--version") {
      options.version = true;
    } else if (arg === "--no-ml") {
      options.noMl = true;
    } else if (arg === "-o" || arg === "--output") {
      const val = args[++i];
      if (val) options.output = val;
    } else if (arg === "-f" || arg === "--format") {
      options.format = args[++i] as "text" | "json";
    } else if (arg === "-s" || arg === "--strategy") {
      options.strategy = args[++i] as
        | "defer"
        | "prefer-a"
        | "prefer-b"
        | "prefer-c"
        | "concatenate";
    } else if (!arg.startsWith("-")) {
      if (!command) {
        // First non-option argument is the command
        command = arg;
      } else {
        files.push(arg);
      }
    }
  }

  return { command, files, options };
}

async function readTextFile(filePath: string): Promise<string> {
  const resolved = resolve(process.cwd(), filePath);
  return readFile(resolved, "utf-8");
}

async function writeOutput(
  content: string,
  outputPath?: string
): Promise<void> {
  if (outputPath) {
    const resolved = resolve(process.cwd(), outputPath);
    await writeFile(resolved, content, "utf-8");
    console.error(`Written to: ${resolved}`);
  } else {
    console.log(content);
  }
}

async function cmdDiff(files: string[], options: CliOptions): Promise<void> {
  if (files.length < 2) {
    console.error("Error: diff requires two files: <base> <modified>");
    process.exit(1);
  }

  const [basePath, modifiedPath] = files;
  const base = await readTextFile(basePath!);
  const modified = await readTextFile(modifiedPath!);

  const result = await diff(base, modified);

  if (options.format === "json") {
    await writeOutput(JSON.stringify(result, null, 2), options.output);
  } else {
    // Text format: show a readable diff
    let output = `Diff: ${basePath} → ${modifiedPath}\n`;
    output += `Summary: ${summarizeDiff(result)}\n\n`;

    for (const edit of result.edits) {
      switch (edit.operation) {
        case "KEEP":
          output += `  ${edit.oldContent}\n`;
          break;
        case "DELETE":
          output += `- ${edit.oldContent}\n`;
          break;
        case "INSERT":
          output += `+ ${edit.newContent}\n`;
          break;
        case "REPLACE":
          output += `- ${edit.oldContent}\n`;
          output += `+ ${edit.newContent}\n`;
          break;
      }
    }

    await writeOutput(output, options.output);
  }
}

async function cmdPatch(files: string[], options: CliOptions): Promise<void> {
  if (files.length < 2) {
    console.error("Error: patch requires two files: <base> <modified>");
    process.exit(1);
  }

  const [basePath, modifiedPath] = files;
  const base = await readTextFile(basePath!);
  const modified = await readTextFile(modifiedPath!);

  const patch = await generatePatch(base, modified);
  const serialized = serializePatch(patch);

  if (options.format === "text" && !options.output) {
    // Pretty print for terminal
    console.log(JSON.stringify(JSON.parse(serialized), null, 2));
  } else {
    await writeOutput(serialized, options.output);
  }
}

async function cmdApply(files: string[], options: CliOptions): Promise<void> {
  if (files.length < 2) {
    console.error("Error: apply requires two files: <base> <patch>");
    process.exit(1);
  }

  const [basePath, patchPath] = files;
  const base = await readTextFile(basePath!);
  const patchJson = await readTextFile(patchPath!);

  const patch = deserializePatch(patchJson);
  const result = await applyPatch(base, patch);

  if (options.format === "json") {
    await writeOutput(JSON.stringify(result, null, 2), options.output);
  } else {
    // Show result with stats
    if (result.failed.length > 0) {
      console.error(`Warning: ${result.failed.length} edit(s) failed to apply`);
    }
    if (result.adapted.length > 0) {
      console.error(`Note: ${result.adapted.length} edit(s) were adapted`);
    }
    await writeOutput(result.result, options.output);
  }
}

async function cmdMerge(files: string[], options: CliOptions): Promise<void> {
  if (files.length < 3) {
    console.error(
      "Error: merge requires three files: <base-v1> <base-v2> <user>"
    );
    process.exit(1);
  }

  const [v1Path, v2Path, userPath] = files;
  const baseV1 = await readTextFile(v1Path!);
  const baseV2 = await readTextFile(v2Path!);
  const userCustom = await readTextFile(userPath!);

  const mergeOptions: Parameters<typeof merge>[3] = {};
  if (options.strategy) mergeOptions.conflictStrategy = options.strategy;

  const result = await merge(baseV1, baseV2, userCustom, mergeOptions);

  if (options.format === "json") {
    await writeOutput(JSON.stringify(result, null, 2), options.output);
  } else {
    // Show stats
    const { stats, conflicts } = result;
    console.error(`Merge complete:`);
    console.error(`  Unchanged: ${stats.unchanged}`);
    console.error(`  Upgraded:  ${stats.upgraded}`);
    console.error(`  Preserved: ${stats.preserved}`);
    if (stats.conflicts > 0) {
      console.error(
        `  Conflicts: ${stats.conflicts} (${stats.autoResolved} auto-resolved)`
      );
    }
    if (conflicts.length > 0) {
      console.error(`\nUnresolved conflicts: ${conflicts.length}`);
      console.error("Conflict markers have been inserted in the output.");
    }

    await writeOutput(result.merged, options.output);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, files, options } = parseArgs(args);

  if (options.version) {
    console.log(`betterprompt v${VERSION}`);
    process.exit(0);
  }

  if (options.help || !command) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  // Use char-frequency similarity if --no-ml is specified
  if (options.noMl) {
    setDefaultProvider(new CharFrequencyEmbeddingProvider());
  }

  try {
    switch (command) {
      case "diff":
        await cmdDiff(files, options);
        break;
      case "patch":
        await cmdPatch(files, options);
        break;
      case "apply":
        await cmdApply(files, options);
        break;
      case "merge":
        await cmdMerge(files, options);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred");
    }
    process.exit(1);
  }
}

main();
