import { defineConfig } from "tsup";

const isDev = process.env.NODE_ENV === "development";

export default defineConfig([
  // Main Node.js build
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: isDev,
    target: "node20",
    outDir: "dist",
    splitting: false,
    treeshake: true,
    // Don't bundle onnxruntime - let users install it
    external: ["onnxruntime-node"],
  },
  // CLI build
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: isDev,
    target: "node20",
    outDir: "dist",
    splitting: false,
    treeshake: true,
    external: ["onnxruntime-node"],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  // Browser build (for demo/GitHub Pages)
  {
    entry: ["src/browser.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: isDev,
    target: "es2022",
    outDir: "dist",
    platform: "browser",
    globalName: "PromptMerge",
    splitting: false,
    treeshake: true,
    noExternal: [/.*/], // Bundle all dependencies for browser
  },
]);
