#!/usr/bin/env node
// Runs only against the CI-owned, local Supabase instance. No production credentials.
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const dbUrl = process.env.ALP_R1_CI_DATABASE_URL;
const expectedProject = "autolearnpro-foundation6";
const project = process.env.ALP_R1_CI_PROJECT_ID;
if (process.env.CI !== "true" || project !== expectedProject || !dbUrl) {
  throw new Error("R1 CI live gate requires GitHub CI and the expected local Supabase project");
}
const u = new URL(dbUrl);
if (
  !["127.0.0.1", "localhost"].includes(u.hostname) ||
  u.port !== "55132" ||
  u.pathname !== "/postgres" ||
  u.username !== "postgres"
) {
  throw new Error("Refusing an unexpected R1 CI database connection");
}
const admin = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
let createdLogin = false;
let createdApprovalLogin = false;
let createdMarker = false;
let r2PasswordAssigned = false;
let result = 2;
try {
  await admin.connect();
  const history = await admin.query("SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations");
  if (history.rows[0]?.n !== 27) throw new Error("Exactly 27 applied migrations required");
  // D02-E-R1: exact recovered hosted-only migration must be applied
  // before the D02-D signer migration, with no generated passwords.
  const recovered = await admin.query(
    "SELECT version FROM supabase_migrations.schema_migrations WHERE version IN ($1,$2) ORDER BY version",
    ["20261114202924", "20261119011728"]
  );
  if (recovered.rowCount !== 2 ||
      recovered.rows[0].version !== "20261114202924" ||
      recovered.rows[1].version !== "20261119011728") {
    throw new Error("Missing or misordered combined-history migrations");
  }
  const workerRoles = await admin.query(`
    SELECT worker.rolname AS login_role, worker.rolcanlogin, worker.rolinherit,
           worker.rolsuper, worker.rolbypassrls,
           owner.rolname AS executor_role, membership.inherit_option,
           membership.set_option, membership.admin_option,
           (SELECT rolpassword IS NULL FROM pg_authid WHERE oid = worker.oid) AS passwordless
    FROM pg_roles worker
    LEFT JOIN pg_auth_members membership ON membership.member = worker.oid
    LEFT JOIN pg_roles owner ON owner.oid = membership.roleid
    WHERE worker.rolname IN ('alp_academic_worker_login','alp_approval_worker_login')
    ORDER BY worker.rolname
  `);
  const expectedRoles = new Map([
    ["alp_academic_worker_login", "alp_academic_executor"],
    ["alp_approval_worker_login", "alp_approval_executor"],
  ]);
  if (workerRoles.rowCount !== 2 ||
      workerRoles.rows.some((r) => !expectedRoles.has(r.login_role) ||
        expectedRoles.get(r.login_role) !== r.executor_role ||
        r.rolcanlogin !== true || r.rolinherit !== false ||
        r.rolsuper !== false || r.rolbypassrls !== false ||
        r.inherit_option !== false || r.set_option !== true ||
        r.admin_option !== false || r.passwordless !== true)) {
    throw new Error("Recovered worker-login migration violates restricted role contract");
  }
  const role = await admin.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='alp_academic_executor'");
  if (role.rowCount !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
    throw new Error("Restricted executor role is absent or privileged");
  }
  const marker = await admin.query("SELECT to_regclass('alp_verification.marker') AS marker");
  if (marker.rows[0]?.marker) throw new Error("CI marker already present; refusing reused database");
  const login = await admin.query("SELECT 1 FROM pg_roles WHERE rolname='alp_r1_ci_login'");
  if (login.rowCount) throw new Error("CI login already present; refusing reused database");

  const token = randomUUID();
  const attestationKey = randomBytes(32).toString("hex");
  const password = randomBytes(32).toString("hex");
  await admin.query("CREATE SCHEMA alp_verification");
  createdMarker = true;
  await admin.query("REVOKE ALL ON SCHEMA alp_verification FROM PUBLIC");
  await admin.query("CREATE TABLE alp_verification.marker(token text NOT NULL)");
  await admin.query("REVOKE ALL ON alp_verification.marker FROM PUBLIC");
  await admin.query("INSERT INTO alp_verification.marker(token) VALUES($1)", [token]);
  // CI-only signer secret. Never print it or write it to repository files.
  await admin.query("INSERT INTO alp_private.alp_approval_attestation_keys(key_id,key_bytes) VALUES(1,decode($1,'hex'))", [attestationKey]);
  // Password is generated locally for this disposable CI database. Never log it.
  await admin.query(
    `CREATE ROLE alp_r1_ci_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`
  );
  createdLogin = true;
  await admin.query("GRANT alp_academic_executor TO alp_r1_ci_login WITH SET TRUE, INHERIT FALSE");
  await admin.query("GRANT alp_academic_executor TO postgres WITH SET TRUE");

  const check = await admin.query(
    "SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='alp_r1_ci_login'"
  );
  if (
    check.rowCount !== 1 || check.rows[0].rolcanlogin !== true ||
    check.rows[0].rolsuper !== false || check.rows[0].rolbypassrls !== false
  ) throw new Error("CI application login is not restricted");
  const app = new URL(dbUrl);
  app.username = "alp_r1_ci_login";
  app.password = password;
  console.log("R1 CI: 27 migrations; restricted login and scratch marker verified");
  const child = spawnSync(process.execPath, ["infrastructure/scripts/run-r1-live.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      ALP_R1_DATABASE_URL: dbUrl,
      ALP_R1_APP_DATABASE_URL: app.toString(),
      ALP_R1_EXPECTED_MARKER: token,
      ALP_R1_REQUIRE: "1",
    },
    timeout: 180000,
  });
  if (child.error) throw child.error;
  result = child.status ?? 2;
  if (result === 0) {
    const approvalPassword = randomBytes(32).toString("hex");
    await admin.query(
      `CREATE ROLE alp_approval_ci_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${approvalPassword}'`
    );
    createdApprovalLogin = true;
    await admin.query(
      "GRANT alp_approval_executor TO alp_approval_ci_login WITH SET TRUE, INHERIT FALSE"
    );
    const approvalUrl = new URL(dbUrl);
    approvalUrl.username = "alp_approval_ci_login";
    approvalUrl.password = approvalPassword;
    const approval = spawnSync(process.execPath, [
      "--test", "tests/approval-executor-live.test.mjs"
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        ALP_APPROVAL_CI_ADMIN_URL: dbUrl,
        ALP_APPROVAL_CI_APP_URL: approvalUrl.toString(),
        ALP_R1_EXPECTED_MARKER: token,
        ALP_APPROVAL_CI_REQUIRE: "1",
        ALP_APPROVAL_ATTESTATION_KEY: attestationKey,
      },
      timeout: 180000,
    });
    if (approval.error) throw approval.error;
    if (approval.status !== 0) throw new Error("Restricted approval executor live gate failed");
    console.log("Approval CI: restricted login and authorization integration passed");
    // Only the disposable CI instance may temporarily authenticate this
    // recovered passwordless role. Restore PASSWORD NULL in finally.
    const r2Password = randomBytes(32).toString("hex");
    await admin.query(`ALTER ROLE alp_approval_worker_login PASSWORD '${r2Password}'`);
    r2PasswordAssigned = true;
    const r2Url = new URL(dbUrl);
    r2Url.username = "alp_approval_worker_login";
    r2Url.password = r2Password;
    const r2 = spawnSync(process.execPath, [
      "--test", "tests/d02e-r2-worker-postgres-live.test.mjs"
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        ALP_R2_CI_REQUIRE: "1",
        ALP_R2_CI_DATABASE_URL: r2Url.toString(),
      },
      timeout: 180000,
    });
    if (r2.error) throw r2.error;
    if (r2.status !== 0) throw new Error("R2 restricted transaction live gate failed");
    console.log("D02-E-R2 CI: restricted Worker transaction integration passed");
    const r3b = spawnSync(process.execPath, [
      "--test", "tests/d02e-r3b-session-broker-live.test.mjs"
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        ALP_R3B_CI_REQUIRE: "1",
        ALP_R3B_ADMIN_DATABASE_URL: dbUrl,
        ALP_R3B_APP_DATABASE_URL: r2Url.toString(),
      },
      timeout: 180000,
    });
    if (r3b.error) throw r3b.error;
    if (r3b.status !== 0) throw new Error("R3B active-session broker live gate failed");
    console.log("D02-E-R3B CI: restricted active-session broker integration passed");
    const r3d = spawnSync(process.execPath, [
      "--test", "tests/d02e-r3d-key-lifecycle-live.test.mjs"
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        ALP_R3D_CI_REQUIRE: "1",
        ALP_R3D_CI_ADMIN_URL: dbUrl,
        ALP_R3D_CI_APP_URL: r2Url.toString(),
        ALP_APPROVAL_ATTESTATION_KEY: attestationKey,
      },
      timeout: 180000,
    });
    if (r3d.error) throw r3d.error;
    if (r3d.status !== 0) throw new Error("R3D signing key lifecycle gate failed");
    console.log("D02-E-R3D CI: key rotation, overlap and revocation passed");
  }
  if (result === 0) {
    const fixtures = await admin.query(
      `SELECT count(*)::int AS n FROM auth.users WHERE id IN
       ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666')`
    );
    if (fixtures.rows[0]?.n !== 0) throw new Error("R1 live tests left fixed user fixtures");
    console.log("R1 CI: 3 live tests passed and fixed fixture users cleaned");
  }
} finally {
  if (r2PasswordAssigned) {
    await admin.query("ALTER ROLE alp_approval_worker_login PASSWORD NULL");
  }
  if (createdApprovalLogin) {
    await admin.query("REVOKE alp_approval_executor FROM alp_approval_ci_login");
    await admin.query("DROP ROLE alp_approval_ci_login");
  }
  if (createdLogin) {
    await admin.query("REVOKE alp_academic_executor FROM alp_r1_ci_login");
    await admin.query("DROP ROLE alp_r1_ci_login");
  }
  if (createdMarker) await admin.query("DROP SCHEMA alp_verification CASCADE");
  await admin.end();
}
if (result !== 0) throw new Error(`R1 CI live suite failed with exit code ${result}`);
