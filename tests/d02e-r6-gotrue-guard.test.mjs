import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const script = "tests/d02e-r6-gotrue-revocation-live.test.mjs";
function run(env) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    timeout: 12000,
    env: {
      ...process.env,
      ALP_R6_CI_REQUIRE: "1",
      CI: "false",
      ALP_R6_CI_PROJECT_ID: "bad",
      ALP_R6_CI_DATABASE_URL: "postgresql://postgres:postgres@outside.invalid:5432/postgres",
      ALP_R6_CI_WORKER_DATABASE_URL: "postgresql://x:y@outside.invalid:5432/postgres",
      ALP_R6_CI_ATTESTATION_KEY: "a".repeat(64),
      ...env,
    },
  });
}
test("R6 refuses non-CI execution before touching GoTrue or PostgreSQL", () => {
  const r = run({});
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /R6 requires explicit disposable GitHub CI/);
});
test("R6 refuses hosted or external database targets", () => {
  const r = run({ CI: "true", ALP_R6_CI_PROJECT_ID: "autolearnpro-foundation6" });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /R6 refuses non-disposable database connection/);
});
test("R6 refuses unconfigured signing credentials", () => {
  const r = run({
    CI: "true",
    ALP_R6_CI_PROJECT_ID: "autolearnpro-foundation6",
    ALP_R6_CI_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55132/postgres",
    ALP_R6_CI_WORKER_DATABASE_URL:
      "postgresql://alp_approval_worker_login:synthetic@127.0.0.1:55132/postgres",
    ALP_R6_CI_ATTESTATION_KEY: "invalid",
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /R6 synthetic signer unavailable/);
});
