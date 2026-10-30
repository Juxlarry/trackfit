import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The plan engine lives in the backend (one source of truth for the
// generator rules) and is pure TypeScript, so the web app imports it
// directly for instant previews during onboarding. See backend/src/modules/planning/engine.
const engine = fileURLToPath(new URL("../backend/src/modules/planning/engine/index.ts", import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Vite reads .env in production builds too, so a local dev-bypass flag would
  // ship a site anyone can sign into without a password. Refuse to build it.
  // Override in .env.production.local (see README, "Deploying").
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build" && mode === "production") {
    if (env.VITE_DEV_AUTH_BYPASS === "true") throw new Error("VITE_DEV_AUTH_BYPASS is \"true\" in a production build. Set it to \"false\" in web/.env.production.local.");
    const missing = ["VITE_API_URL", "VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID"].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Missing for a production build: ${missing.join(", ")}. Set them in web/.env.production.local.`);
  }
  return {
    plugins: [react()],
    resolve: { alias: { "@engine": engine } },
    server: { fs: { allow: [".."] } },
  };
});
