import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The plan engine lives in the backend (one source of truth for the
// generator rules) and is pure TypeScript, so the web app imports it
// directly for instant previews during onboarding. See backend/src/modules/planning/engine.
const engine = fileURLToPath(new URL("../backend/src/modules/planning/engine/index.ts", import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@engine": engine } },
  server: { fs: { allow: [".."] } },
});
