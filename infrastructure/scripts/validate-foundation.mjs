import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const required = ["apps/web", "apps/simulator", "apps/classroom", "packages/ui", "packages/core", "packages/curriculum", "packages/diagnostics", "supabase/functions", "supabase/migrations", "infrastructure/docker", "infrastructure/cloudflare", "tests", "docs"];
const missing = required.filter((p) => !existsSync(join(root, p)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (manifest.private !== true || manifest.name !== "autolearnpro") throw new Error("Invalid root package manifest");
if (missing.length) throw new Error(`Missing directories: ${missing.join(", ")}`);
console.log(`Foundation 1 validated: ${required.length} directories, isolated root manifest, no dependencies required.`);
