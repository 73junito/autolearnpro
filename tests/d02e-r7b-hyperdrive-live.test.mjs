import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import pg from "pg";

const REQUIRE = process.env.ALP_R7B_CI_REQUIRE === "1";
const ADMIN_URL = process.env.ALP_R7B_CI_ADMIN_URL;
const APP_URL = process.env.ALP_R7B_CI_APP_URL;
const KEY = process.env.ALP_R7B_CI_ATTESTATION_KEY;
const PROJECT = "autolearnpro-foundation6";
function localOnly(raw, user) {
  const u = new URL(raw);
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    u.username !== user ||
    u.port !== "55132" ||
    u.pathname !== "/postgres"
  )
    throw Error("R7B refuses non-disposable PostgreSQL target");
}
if (REQUIRE) {
  if (process.env.CI !== "true" || process.env.ALP_R7B_CI_PROJECT_ID !== PROJECT)
    throw Error("R7B requires exact disposable GitHub CI marker");
  localOnly(ADMIN_URL, "postgres");
  localOnly(APP_URL, "alp_approval_worker_login");
  if (!/^[0-9a-f]{64}$/i.test(KEY || "")) throw Error("R7B requires synthetic signer key");
}
test(
  "R7B real workerd Hyperdrive restricted PostgreSQL transactions and revocation",
  {
    skip: !REQUIRE,
    timeout: 90000,
  },
  async () => {
    const actor = randomUUID(),
      session = randomUUID();
    const dir = mkdtempSync(path.join(process.cwd(), ".r7b-workerd-"));
    const bundle = path.join(dir, "probe.mjs");
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    let runtime;
    await admin.connect();
    try {
      const marker = await admin.query("SELECT token FROM alp_verification.marker");
      assert.equal(marker.rowCount, 1, "R7B demands disposable instance marker");
      await admin.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
        actor,
        `r7b-${actor}@example.test`,
      ]);
      await admin.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)", [session, actor]);
      await build({
        entryPoints: ["tests/fixtures/r7b-workerd-postgres-probe.mjs"],
        outfile: bundle,
        platform: "node",
        format: "esm",
        target: "es2022",
        bundle: true,
        external: ["node:*"],
        conditions: ["workerd", "worker", "browser", "import"],
        logLevel: "silent",
        banner: {
          js: "import { createRequire as __r7bCreateRequire } from 'node:module'; const require = __r7bCreateRequire(import.meta.url);",
        },
      });
      runtime = new Miniflare({
        modules: true,
        scriptPath: bundle,
        compatibilityDate: "2026-08-06",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          R7B_TEST_ONLY: "disposable-local-gate",
          TEST_ACTOR: actor,
          TEST_SESSION: session,
          TEST_SIGNING_KEY: KEY,
        },
        hyperdrives: { APPROVAL_HYPERDRIVE: APP_URL },
      });
      const probe = async (operation) => {
        const response = await runtime.dispatchFetch("http://r7b.invalid/probe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operation }),
        });
        assert.equal(response.status, 200, `workerd ${operation} transport failed`);
        return response.json();
      };
      assert.deepEqual(await probe("identity"), {
        login: "alp_approval_worker_login",
        executor: "alp_approval_executor",
      });
      assert.deepEqual(await probe("session"), { active: true });
      assert.deepEqual(await probe("forbidden"), { denied: true });
      const committed = await probe("commit");
      assert.equal(committed.allowed, true);
      let quota = await admin.query(
        "SELECT attempts FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1",
        [actor],
      );
      assert.equal(quota.rows[0]?.attempts, 1);
      assert.deepEqual(await probe("rollback"), { rolledBack: true });
      quota = await admin.query(
        "SELECT attempts FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1",
        [actor],
      );
      assert.equal(quota.rows[0]?.attempts, 1, "rolled-back signed quota mutated persistent state");
      await admin.query("DELETE FROM auth.sessions WHERE id=$1", [session]);
      assert.deepEqual(await probe("session"), { active: false });
      console.log(
        "R7B PASS: real workerd Hyperdrive PostgreSQL identity, commit, rollback, permissions and session revocation",
      );
    } finally {
      if (runtime) await runtime.dispose();
      await admin
        .query("DELETE FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1", [actor])
        .catch(() => {});
      await admin.query("DELETE FROM auth.sessions WHERE id=$1", [session]).catch(() => {});
      await admin.query("DELETE FROM auth.users WHERE id=$1", [actor]).catch(() => {});
      await admin.end().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
