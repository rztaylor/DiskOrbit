import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../internal/webui/assets/generated",
    emptyOutDir: true,
    rollupOptions: {
      external: ["singleserve-client"],
      output: {
        paths: {
          "singleserve-client": "/_singleserve/client.js",
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
