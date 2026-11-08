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
let createdMarker = false;
let result = 2;
try {
  await admin.connect();
  const history = await admin.query("SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations");
  if (history.rows[0]?.n !== 21) throw new Error("Exactly 21 applied migrations required");
  const role = await admin.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='alp_academic_executor'");
  if (role.rowCount !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
    throw new Error("Restricted executor role is absent or privileged");
  }
  const marker = await admin.query("SELECT to_regclass('alp_verification.marker') AS marker");
  if (marker.rows[0]?.marker) throw new Error("CI marker already present; refusing reused database");
  const login = await admin.query("SELECT 1 FROM pg_roles WHERE rolname='alp_r1_ci_login'");
  if (login.rowCount) throw new Error("CI login already present; refusing reused database");

  const token = randomUUID();
  const password = randomBytes(32).toString("hex");
  await admin.query("CREATE SCHEMA alp_verification");
  createdMarker = true;
  await admin.query("REVOKE ALL ON SCHEMA alp_verification FROM PUBLIC");
  await admin.query("CREATE TABLE alp_verification.marker(token text NOT NULL)");
  await admin.query("REVOKE ALL ON alp_verification.marker FROM PUBLIC");
  await admin.query("INSERT INTO alp_verification.marker(token) VALUES($1)", [token]);
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
  console.log("R1 CI: 21 migrations; restricted login and scratch marker verified");
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
  if (createdLogin) {
    await admin.query("REVOKE alp_academic_executor FROM alp_r1_ci_login");
    await admin.query("DROP ROLE alp_r1_ci_login");
  }
  if (createdMarker) await admin.query("DROP SCHEMA alp_verification CASCADE");
  await admin.end();
}
if (result !== 0) throw new Error(`R1 CI live suite failed with exit code ${result}`);
