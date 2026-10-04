import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Single source of truth for vessel IDs, shared with the backend.
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
  server: { fs: { allow: [".."] } },
  build: {
    // three.js alone is ~940 kB minified (251 kB gzip) and cannot be split further; it is cached separately.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        // Large, rarely-changing libraries get their own long-cacheable chunks.
        codeSplitting: {
          groups: [
            { name: "three", test: /node_modules[\/](three|three-stdlib|@react-three|troika|maath|camera-controls)/, priority: 3 },
            { name: "charts", test: /node_modules[\/](recharts|d3-|victory-vendor|es-toolkit|immer|redux|@reduxjs|reselect)/, priority: 2 },
            { name: "react", test: /node_modules[\/](react|react-dom|scheduler)[\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  test: { environment: "node" },
});
