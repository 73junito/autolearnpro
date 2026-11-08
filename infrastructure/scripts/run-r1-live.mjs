#!/usr/bin/env node
// A mandatory live R1 gate: do not silently skip when scratch DB is absent.
import { spawnSync } from "node:child_process";

for (const key of ["ALP_R1_DATABASE_URL", "ALP_R1_APP_DATABASE_URL", "ALP_R1_EXPECTED_MARKER"]) {
  if (!process.env[key]) {
    console.error(`R1 live gate refused: missing ${key}`);
    process.exit(2);
  }
}
const args = [
  "--test",
  "tests/academic-rls.test.mjs",
  "tests/academic-executor-live.test.mjs",
  "tests/academic-progress-live.test.mjs",
];
const run = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, ALP_R1_REQUIRE: "1" },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 2;
