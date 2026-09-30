import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  esbuild: {
    loader: "tsx",
    include: /.*\.tsx?$/
  },
  server: {
    port: 3001,
    host: true,
    watch: {
      ignored: ["**/*.test.ts", "**/dist/**", "**/.git/**"]
    }
  }
});
