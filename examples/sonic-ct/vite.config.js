import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/SonicChamber/demo/" : "/",
  plugins: [react()],
  server: { port: 5184, host: true },
  build: { target: "esnext" },
});
