import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const script = "tests/d02e-r7c-workerd-approval-live.test.mjs";
function run(env = {}) {
  return spawnSync(process.execPath, [script], {
    env: {
      ...process.env,
      ALP_R7C_CI_REQUIRE: "1",
      CI: "false",
      ALP_R7C_CI_PROJECT_ID: "invalid",
      ALP_R7C_CI_ADMIN_URL: "postgresql://postgres:test@remote.invalid:5432/postgres",
      ALP_R7C_CI_LOGIN_URL:
        "postgresql://alp_approval_worker_login:test@remote.invalid:5432/postgres",
      ALP_R7C_CI_ATTESTATION_KEY: "a".repeat(64),
      ...env,
    },
    encoding: "utf8",
    timeout: 12000,
  });
}
test("R7C refuses execution outside authorized disposable CI", () => {
  const p = run();
  assert.equal(p.status, 1);
  assert.match(p.stderr, /R7C requires explicit disposable GitHub CI marker/);
});
test("R7C refuses non-loopback database targets before any GoTrue calls", () => {
  const p = run({ CI: "true", ALP_R7C_CI_PROJECT_ID: "autolearnpro-foundation6" });
  assert.equal(p.status, 1);
  assert.match(p.stderr, /R7C refuses non-disposable PostgreSQL connection/);
});
test("R7C refuses absent signing key", () => {
  const p = run({
    CI: "true",
    ALP_R7C_CI_PROJECT_ID: "autolearnpro-foundation6",
    ALP_R7C_CI_ADMIN_URL: "postgresql://postgres:ci@127.0.0.1:55132/postgres",
    ALP_R7C_CI_LOGIN_URL: "postgresql://alp_approval_worker_login:ci@127.0.0.1:55132/postgres",
    ALP_R7C_CI_ATTESTATION_KEY: "invalid",
  });
  assert.equal(p.status, 1);
  assert.match(p.stderr, /R7C requires synthetic signing material/);
});
