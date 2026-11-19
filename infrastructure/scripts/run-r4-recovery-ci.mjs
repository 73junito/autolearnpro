#!/usr/bin/env node
// D02-E-R4: isolated CI-only full logical PostgreSQL backup and clean restore.
// No production credentials, external endpoints, or persistent archive exports.
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
function command(tool, args, input) {
  const result = spawnSync(tool, args, {
    input,
    maxBuffer,
    timeout: 180000,
    encoding: null,
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    const message = result.stderr?.toString("utf8").slice(-900) || "";
    throw new Error(`R4 database tool failed: ${tool} (exit ${result.status}) ${message}`, {
      cause: result.error,
    });
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
const archivePath = path.join(scratch, "disposable-backup.dump");
const sourceClient = new pg.Client({ connectionString: sourceUrl });
let targetClient;
let databaseCreated = false;
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
async function snapshot(client) {
  const lineage = await client.query(
    "SELECT version, statements::text AS statements FROM supabase_migrations.schema_migrations ORDER BY version",
  );
  const keys = await client.query(
    "SELECT key_id, state, not_after, encode(key_bytes,'hex') AS secret FROM alp_private.alp_approval_attestation_keys ORDER BY key_id",
  );
  const events = await client.query(
    "SELECT event_id, event_type, key_id, overlap_seconds FROM alp_private.alp_approval_key_events ORDER BY event_id",
  );
  const nonces = await client.query(
    "SELECT nonce::text FROM alp_private.alp_approval_used_nonces ORDER BY nonce",
  );
  const security = await client.query(`
    SELECT has_table_privilege('alp_approval_executor',
             'alp_private.alp_approval_attestation_keys','SELECT') AS executor_key_read,
           has_table_privilege('alp_approval_executor','auth.sessions','SELECT') AS executor_auth_read,
           has_function_privilege('anon',
             'alp_private.emergency_revoke_approval_attestations()','EXECUTE') AS anon_revoke,
           has_function_privilege('alp_approval_executor',
             'alp_private.emergency_revoke_approval_attestations()','EXECUTE') AS executor_revoke,
           has_function_privilege('alp_approval_executor',
             'alp_private.lock_approval_actor_session(uuid,uuid)','EXECUTE') AS executor_lock,
           has_function_privilege('alp_approval_executor',
             'alp_private.rotate_approval_attestation_key(integer,bytea,integer)','EXECUTE') AS executor_rotate,
           (SELECT pg_get_userbyid(proowner)
              FROM pg_proc
             WHERE oid='alp_private.verify_approval_attestation(text,uuid,text[],bigint,uuid,text)'::regprocedure
           ) AS signer_owner
  `);
  const roles = await client.query(
    "SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname IN ('alp_approval_executor','alp_approval_worker_login','alp_academic_executor','alp_academic_worker_login') ORDER BY rolname",
  );
  return {
    lineage: digest(JSON.stringify(lineage.rows)),
    versions: lineage.rows.map((x) => x.version),
    keys: digest(JSON.stringify(keys.rows)), // secrets never printed
    keyStates: keys.rows.map((x) => [x.key_id, x.state]),
    events: digest(JSON.stringify(events.rows)),
    nonces: digest(JSON.stringify(nonces.rows)),
    nonceCount: nonces.rowCount,
    security: security.rows[0],
    roles: roles.rows,
  };
}
try {
  await sourceClient.connect();
  const marker = await sourceClient.query("SELECT token FROM alp_verification.marker");
  assert.equal(marker.rowCount, 1, "R4 requires R1 isolated database marker");
  const history = await sourceClient.query(
    "SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations",
  );
  assert.equal(history.rows[0]?.n, 27, "R4 requires exactly 27 fully applied migrations");
  const exists = await sourceClient.query("SELECT 1 FROM pg_database WHERE datname=$1", [
    restoredName,
  ]);
  assert.equal(exists.rowCount, 0, "R4 refuses existing recovery database");
  const shutdown = await sourceClient.query(
    "SELECT alp_private.emergency_revoke_approval_attestations() AS count",
  );
  assert.equal(shutdown.rows[0].count, 1, "expected one active CI signing key");
  const baseline = await snapshot(sourceClient);
  assert.equal(baseline.versions.length, 27);
  assert.ok(baseline.keyStates.length >= 3);
  assert.ok(baseline.keyStates.every(([, state]) => state === "revoked"));
  assert.ok(baseline.nonceCount > 0, "R4 requires replay history fixtures");
  assert.equal(baseline.security.executor_key_read, false);
  assert.equal(baseline.security.executor_auth_read, false);
  assert.equal(baseline.security.anon_revoke, false);
  assert.equal(baseline.security.executor_revoke, false);
  assert.equal(baseline.security.executor_lock, true);
  assert.equal(baseline.security.executor_rotate, false);
  assert.equal(baseline.security.signer_owner, "service_role");
  assert.equal(baseline.roles.length, 4);

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
  ]);
  assert.ok(archive.length > 10000, "R4 backup archive unexpectedly small");
  writeFileSync(archivePath, archive, { mode: 0o600, flag: "wx" });
  const saved = readFileSync(archivePath);
  assert.equal(digest(saved), digest(archive), "R4 backup archive integrity mismatch");

  await sourceClient.query(`CREATE DATABASE ${restoredName} TEMPLATE template0`);
  databaseCreated = true;
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
    ],
    saved,
  );

  const targetUrl = new URL(sourceUrl);
  targetUrl.pathname = "/" + restoredName;
  targetClient = new pg.Client({ connectionString: targetUrl.toString() });
  await targetClient.connect();
  const recovered = await snapshot(targetClient);
  assert.deepEqual(
    recovered,
    baseline,
    "R4 restored data, migrations, roles and grants must match",
  );

  const revoked = await targetClient.query(
    "SELECT count(*)::int AS n FROM alp_private.alp_approval_attestation_keys WHERE state <> 'revoked'",
  );
  assert.equal(revoked.rows[0]?.n, 0, "R4 must not resurrect revoked HMAC keys");
  const replay = await targetClient.query(
    "SELECT count(*)::int AS n FROM alp_private.alp_approval_used_nonces",
  );
  assert.equal(replay.rows[0]?.n, baseline.nonceCount, "nonce replay history must survive restore");

  console.log("R4 RECOVERY PASS: full logical archive restored to a fresh isolated database");
  console.log(
    "R4 RECOVERY PASS: 27 migration versions, signing-key revocation, nonce replay state, grants, roles and verifier ownership match",
  );
  console.log(
    "R4 RECOVERY PASS: backup SHA-256 integrity verified (digest withheld); ephemeral archive destroyed",
  );
} finally {
  if (targetClient) await targetClient.end().catch(() => {});
  if (databaseCreated) {
    await sourceClient
      .query(`DROP DATABASE IF EXISTS ${restoredName} WITH (FORCE)`)
      .catch((error) => {
        throw new Error("R4 cleanup could not drop recovery database", { cause: error });
      });
  }
  await sourceClient.end().catch(() => {});
  rmSync(scratch, { recursive: true, force: true });
}
