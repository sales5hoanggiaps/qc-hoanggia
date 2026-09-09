import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../../infra"), "");
  Object.assign(process.env, env);

  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,
    },
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
  };
});
