import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const script = "tests/d02e-r7b-hyperdrive-live.test.mjs";
function probe(overrides = {}) {
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      ALP_R7B_CI_REQUIRE: "1",
      CI: "false",
      ALP_R7B_CI_PROJECT_ID: "wrong",
      ALP_R7B_CI_ADMIN_URL: "postgresql://postgres:synthetic@host.invalid:5432/postgres",
      ALP_R7B_CI_APP_URL:
        "postgresql://alp_approval_worker_login:synthetic@host.invalid:5432/postgres",
      ALP_R7B_CI_ATTESTATION_KEY: "a".repeat(64),
      ...overrides,
    },
  });
  return result;
}
test("R7B refuses execution without disposable CI authorization", () => {
  const r = probe();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /requires exact disposable GitHub CI marker/);
});
test("R7B rejects hosted PostgreSQL endpoints before runtime or socket initialization", () => {
  const r = probe({ CI: "true", ALP_R7B_CI_PROJECT_ID: "autolearnpro-foundation6" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refuses non-disposable PostgreSQL target/);
});
test("R7B rejects unconfigured signer key", () => {
  const r = probe({
    CI: "true",
    ALP_R7B_CI_PROJECT_ID: "autolearnpro-foundation6",
    ALP_R7B_CI_ADMIN_URL: "postgresql://postgres:synthetic@127.0.0.1:55132/postgres",
    ALP_R7B_CI_APP_URL: "postgresql://alp_approval_worker_login:synthetic@127.0.0.1:55132/postgres",
    ALP_R7B_CI_ATTESTATION_KEY: "invalid",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /requires synthetic signer key/);
});
