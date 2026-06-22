import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // base must match the GitHub Pages sub-path for the demo
  base: process.env.GITHUB_PAGES ? "/MetaBioHacker/demo/" : "/",
  plugins: [react()],
  server: { port: 5184, host: true },
  build: { target: "esnext" },
});
