import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const SCRIPT = "infrastructure/scripts/run-r4-recovery-ci.mjs";
function probe(env) {
  return spawnSync(process.execPath, [SCRIPT], {
    env: {
      ...process.env,
      CI: "false",
      ALP_R4_CI_PROJECT_ID: "wrong-project",
      ALP_R4_CI_DATABASE_URL: "postgresql://postgres:postgres@db.example.invalid:5432/postgres",
      ...env,
    },
    encoding: "utf8",
    timeout: 10000,
  });
}
test("R4 recovery refuses execution without authorized disposable CI guard", () => {
  const r = probe({});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /R4 requires GitHub CI/);
});

test("R4 recovery refuses non-loopback PostgreSQL targets before connecting", () => {
  const r = probe({
    CI: "true",
    ALP_R4_CI_PROJECT_ID: "autolearnpro-foundation6",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refuses non-disposable/);
});

test("R4 recovery refuses wrong project markers", () => {
  const r = probe({
    CI: "true",
    ALP_R4_CI_PROJECT_ID: "not-our-project",
    ALP_R4_CI_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55132/postgres",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /requires GitHub CI/);
});
