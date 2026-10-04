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
  test: { environment: "node" },
});
