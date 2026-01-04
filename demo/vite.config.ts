import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname),
  base: "/betterprompt/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      // Exclude Node.js-only packages from browser build
      external: ["onnxruntime-node"],
    },
  },
  optimizeDeps: {
    include: ["@xenova/transformers", "onnxruntime-web"],
    // Exclude Node.js-only packages from optimization
    exclude: ["onnxruntime-node"],
  },
  resolve: {
    alias: {
      // Replace onnxruntime-node with empty module in browser
      "onnxruntime-node": resolve(__dirname, "empty-module.js"),
    },
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (used by transformers.js)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // Ensure WASM files are served with correct MIME type
  assetsInclude: ["**/*.wasm"],
});
