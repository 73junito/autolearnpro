import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Read-only migration manifest comparison. Never repairs or applies anything.
export function compareMigrationVersions(localFiles, remoteMigrations) {
  const local = new Map();
  for (const filename of localFiles) {
    const match = /^(\d{14})_([a-z0-9_-]+)\.sql$/i.exec(filename);
    if (!match) continue;
    if (local.has(match[1])) throw new Error("Duplicate local migration version: " + match[1]);
    local.set(match[1], match[2]);
  }
  const remote = new Map();
  for (const item of remoteMigrations) {
    if (!/^\d{14}$/.test(String(item.version))) throw new Error("Invalid remote version");
    if (remote.has(String(item.version))) throw new Error("Duplicate remote migration version");
    remote.set(String(item.version), item.name ?? null);
  }
  const missingLocal = [...remote.keys()].filter((v) => !local.has(v));
  const pendingRemote = [...local.keys()].filter((v) => !remote.has(v));
  const nameDifferences = [...remote.entries()]
    .filter(([v, name]) => local.has(v) && name && local.get(v) !== name)
    .map(([version, remoteName]) => ({ version, localName: local.get(version), remoteName }));
  return {
    localCount: local.size,
    remoteCount: remote.size,
    missingLocal,
    pendingRemote,
    nameDifferences,
    reconciled:
      missingLocal.length === 0 && pendingRemote.length === 0 && nameDifferences.length === 0,
  };
}

async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error("Provide a read-only migration metadata JSON file");
  const data = JSON.parse(await readFile(resolve(filename), "utf8"));
  const migrations = Array.isArray(data) ? data : data.migrations;
  if (!Array.isArray(migrations)) throw new Error("Expected migrations array");
  const localFiles = await readdir(resolve("supabase/migrations"));
  const report = compareMigrationVersions(localFiles, migrations);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.reconciled) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error("Migration manifest check failed:", err.message);
    process.exitCode = 1;
  });
}
