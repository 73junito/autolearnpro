#!/usr/bin/env node
// Disposable read-only Supabase recovery inventory. Never a production auditor.
import assert from "node:assert/strict";
import pg from "pg";
import { collectRecoveryPreflight, recoveryScope } from "./r5-recovery-preflight.mjs";
const url = process.env.ALP_R5_CI_DATABASE_URL;
if (
  process.env.CI !== "true" ||
  process.env.ALP_R5_CI_PROJECT_ID !== "autolearnpro-foundation6" ||
  !url
)
  throw new Error("R5 requires explicitly authorized disposable CI database");
const target = new URL(url);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "55132" ||
  target.username !== "postgres" ||
  target.pathname !== "/postgres"
) {
  throw new Error("R5 refuses non-disposable PostgreSQL target");
}
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query("BEGIN TRANSACTION READ ONLY");
  const marker = await client.query("SELECT token FROM alp_verification.marker");
  assert.equal(marker.rowCount, 1, "disposable R1 marker required");
  const manifest = await collectRecoveryPreflight(client);
  const outcome = recoveryScope(manifest);
  if (outcome.status !== "INVENTORY_VERIFIED") {
    throw new Error(
      "R5 preflight rejects incomplete or privilege-widened recovery inventory: " +
        outcome.findings.join("; "),
    );
  }
  assert.equal(outcome.independentlyRestored, false);
  assert.equal(outcome.fullSupabaseRestoreVerified, false);
  assert.equal(manifest.migrations.count, 27);
  console.log(
    "R5 PREFLIGHT PASS: 27 migration receipts; metadata-only role/schema/extension/definer/grant inventory verified",
  );
  console.log(
    "R5 REMAINING HOLD: independent Supabase managed-schema/global-role recovery is NOT verified",
  );
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
