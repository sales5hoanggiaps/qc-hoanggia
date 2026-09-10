import fs from "node:fs";
import path from "node:path";

// apps/worker/src(or dist)/env.ts -> repo root is 3 levels up either way
// (apps/worker/src/env.ts or apps/worker/dist/env.js are both 3 levels deep).
const envPath = path.resolve(__dirname, "../../../infra/.env");

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2];
    }
  }
}
