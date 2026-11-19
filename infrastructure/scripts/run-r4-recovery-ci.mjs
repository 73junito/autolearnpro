#!/usr/bin/env node
// R4: CI-only approval security-state logical backup to a clean scratch database.
// Scope is explicit; this is NOT full Supabase infrastructure/PITR recovery.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import pg from "pg";

const project = "autolearnpro-foundation6";
const sourceUrl = process.env.ALP_R4_CI_DATABASE_URL;
if (process.env.CI !== "true" || process.env.ALP_R4_CI_PROJECT_ID !== project || !sourceUrl) {
  throw new Error("R4 requires GitHub CI and explicit disposable Supabase project");
}
const source = new URL(sourceUrl);
if (
  !["localhost", "127.0.0.1"].includes(source.hostname) ||
  source.port !== "55132" ||
  source.pathname !== "/postgres" ||
  source.username !== "postgres"
) {
  throw new Error("R4 refuses non-disposable PostgreSQL source");
}

const restoredName = "alp_r4_recovered";
const dockerName = "supabase_db_" + project;
const maxBuffer = 128 * 1024 * 1024;
const tables = [
  "alp_private.alp_approval_attestation_keys",
  "alp_private.alp_approval_used_nonces",
  "alp_private.alp_approval_key_events",
  "supabase_migrations.schema_migrations",
];
function command(tool, args, input) {
  const result = spawnSync(tool, args, {
    input,
    maxBuffer,
    timeout: 180000,
    encoding: null,
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    const stderr = result.stderr?.toString("utf8") || "";
    const firstError =
      stderr.match(/(?:pg_restore: error:|ERROR:)[^\n]*/i)?.[0] || stderr.slice(0, 600);
    throw new Error(
      `R4 tool failed: ${tool} (exit ${result.status}); ${firstError.slice(0, 600)}`,
      {
        cause: result.error,
      },
    );
  }
  return result.stdout;
}
const containers = command("docker", ["ps", "--format", "{{.Names}}"])
  .toString("utf8")
  .trim()
  .split("\n");
if (containers.filter((x) => x === dockerName).length !== 1) {
  throw new Error("R4 requires exactly one isolated Supabase PostgreSQL container");
}
const scratch = mkdtempSync(path.join(tmpdir(), "alp-r4-recovery-"));
const archivePath = path.join(scratch, "disposable-approval-backup.dump");
const sourceClient = new pg.Client({ connectionString: sourceUrl });
let targetClient;
let databaseCreated = false;
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function snapshot(client) {
  const lineage = await client.query(
    "SELECT version,statements::text AS statements FROM supabase_migrations.schema_migrations ORDER BY version",
  );
  const keys = await client.query(
    "SELECT key_id,state,not_after,encode(key_bytes,'hex') AS secret FROM alp_private.alp_approval_attestation_keys ORDER BY key_id",
  );
  const events = await client.query(
    "SELECT event_id,event_type,key_id,overlap_seconds FROM alp_private.alp_approval_key_events ORDER BY event_id",
  );
  const nonces = await client.query(
    "SELECT nonce::text FROM alp_private.alp_approval_used_nonces ORDER BY nonce",
  );
  const permissions = await client.query(`
    SELECT has_table_privilege('alp_approval_executor',
             'alp_private.alp_approval_attestation_keys','SELECT') AS executor_key_read,
           has_table_privilege('alp_approval_executor',
             'alp_private.alp_approval_used_nonces','SELECT') AS executor_nonce_read,
           has_table_privilege('anon',
             'alp_private.alp_approval_attestation_keys','SELECT') AS anon_key_read,
           has_table_privilege('authenticated',
             'alp_private.alp_approval_attestation_keys','SELECT') AS authenticated_key_read
  `);
  return {
    lineageHash: digest(JSON.stringify(lineage.rows)),
    versions: lineage.rows.map((x) => x.version),
    keyHash: digest(JSON.stringify(keys.rows)), // secret values only hashed, never printed
    keyStates: keys.rows.map((x) => [x.key_id, x.state]),
    eventHash: digest(JSON.stringify(events.rows)),
    nonceHash: digest(JSON.stringify(nonces.rows)),
    nonceCount: nonces.rowCount,
    permissions: permissions.rows[0],
  };
}
try {
  await sourceClient.connect();
  const marker = await sourceClient.query("SELECT token FROM alp_verification.marker");
  assert.equal(marker.rowCount, 1, "R4 requires R1 isolated database marker");
  const history = await sourceClient.query(
    "SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations",
  );
  assert.equal(history.rows[0]?.n, 27, "R4 requires exactly 27 applied migrations");
  const exists = await sourceClient.query("SELECT 1 FROM pg_database WHERE datname=$1", [
    restoredName,
  ]);
  assert.equal(exists.rowCount, 0, "R4 refuses existing recovery database");
  const secure = await sourceClient.query(`
    SELECT has_function_privilege('alp_approval_executor',
      'alp_private.rotate_approval_attestation_key(integer,bytea,integer)','EXECUTE') AS executor_rotate,
      has_function_privilege('anon',
      'alp_private.emergency_revoke_approval_attestations()','EXECUTE') AS anon_emergency,
      pg_get_userbyid(proowner) AS signer_owner
    FROM pg_proc WHERE oid=
      'alp_private.verify_approval_attestation(text,uuid,text[],bigint,uuid,text)'::regprocedure
  `);
  assert.equal(secure.rowCount, 1);
  assert.deepEqual(secure.rows[0], {
    executor_rotate: false,
    anon_emergency: false,
    signer_owner: "service_role",
  });
  // Test a critical fail-closed recovery snapshot only on this disposable source.
  const shutdown = await sourceClient.query(
    "SELECT alp_private.emergency_revoke_approval_attestations() AS count",
  );
  assert.equal(shutdown.rows[0].count, 1, "expected one active CI signer key");

  const baseline = await snapshot(sourceClient);
  assert.equal(baseline.versions.length, 27);
  assert.ok(baseline.keyStates.length >= 3);
  assert.ok(baseline.keyStates.every(([, state]) => state === "revoked"));
  assert.ok(baseline.nonceCount > 0, "R4 needs existing nonce-replay history");
  assert.deepEqual(baseline.permissions, {
    executor_key_read: false,
    executor_nonce_read: false,
    anon_key_read: false,
    authenticated_key_read: false,
  });

  // Schema-specific archive intentionally excludes Supabase Auth/Realtime/
  // Storage managed infrastructure whose ownership is not independently restorable.
  const archive = command("docker", [
    "exec",
    dockerName,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--format=custom",
    "--no-password",
    ...tables.flatMap((t) => ["--table", t]),
  ]);
  assert.ok(archive.length > 1000, "R4 scoped backup unexpectedly small");
  writeFileSync(archivePath, archive, { mode: 0o600, flag: "wx" });
  const saved = readFileSync(archivePath);
  assert.equal(digest(saved), digest(archive), "R4 archive checksum mismatch");

  await sourceClient.query(`CREATE DATABASE ${restoredName} TEMPLATE template0`);
  databaseCreated = true;
  const targetUrl = new URL(sourceUrl);
  targetUrl.pathname = "/" + restoredName;
  targetClient = new pg.Client({ connectionString: targetUrl.toString() });
  await targetClient.connect();
  await targetClient.query("CREATE SCHEMA alp_private");
  await targetClient.query("CREATE SCHEMA supabase_migrations");

  command(
    "docker",
    [
      "exec",
      "-i",
      dockerName,
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      restoredName,
      "--exit-on-error",
      "--single-transaction",
      "--no-password",
      "--no-owner",
    ],
    saved,
  );

  const recovered = await snapshot(targetClient);
  assert.deepEqual(recovered, baseline, "R4 approval security-state restoration mismatch");
  const blocked = await targetClient.query(
    "SELECT count(*)::int AS n FROM alp_private.alp_approval_attestation_keys WHERE state <> 'revoked'",
  );
  assert.equal(blocked.rows[0]?.n, 0, "restore resurrected revoked HMAC key");
  const replay = await targetClient.query(
    "SELECT count(*)::int AS n FROM alp_private.alp_approval_used_nonces",
  );
  assert.equal(replay.rows[0]?.n, baseline.nonceCount, "restore lost nonce replay history");
  console.log(
    "R4 RECOVERY PASS: critical approval security-state archive restored into clean database",
  );
  console.log(
    "R4 RECOVERY PASS: 27 migration receipts, key revocations, nonces, audit events, and table read grants match",
  );
  console.log(
    "R4 RECOVERY PASS: archive checksum verified; scratch database and private archive cleaned",
  );
} finally {
  if (targetClient) await targetClient.end().catch(() => {});
  if (databaseCreated) {
    await sourceClient
      .query(`DROP DATABASE IF EXISTS ${restoredName} WITH (FORCE)`)
      .catch((error) => {
        throw new Error("R4 cleanup could not drop recovered database", { cause: error });
      });
  }
  await sourceClient.end().catch(() => {});
  rmSync(scratch, { recursive: true, force: true });
}
