import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../../infra"), "");
  Object.assign(process.env, env);

  return {
    test: { globals: true },
  };
});
