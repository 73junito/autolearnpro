import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createRestrictedApprovalDatabase } from "../apps/web/src/worker-approval-postgres.mjs";
import { createApprovalSessionBroker } from "../apps/web/src/worker-approval-session-broker.mjs";

const ADMIN = process.env.ALP_R3B_ADMIN_DATABASE_URL;
const APP = process.env.ALP_R3B_APP_DATABASE_URL;
const REQUIRE = process.env.ALP_R3B_CI_REQUIRE === "1";
const ACTOR = "ce5c278e-e070-44c2-84d9-0402acb9f210";
const OTHER = "7aa2e438-932d-4ee2-b01b-39121c3cb25d";
const SESSION = "e1f34e97-c9a3-4c6e-a47d-8896391cab86";
const UNKNOWN = "a572a3a4-b3d6-4c5b-9bb9-f2a11f4a26f5";

function localOnly(raw, expectedUser) {
  if (!raw) throw new Error("R3B live verification requires explicit scratch URL");
  const u = new URL(raw);
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    u.port !== "55132" ||
    u.pathname !== "/postgres" ||
    u.username !== expectedUser
  ) {
    throw new Error("R3B refuses non-disposable or unexpected login");
  }
}
if (REQUIRE) {
  localOnly(ADMIN, "postgres");
  localOnly(APP, "alp_approval_worker_login");
}

test(
  "R3B real auth.sessions broker: actor-bound, expires and revokes without direct grants",
  {
    skip: !REQUIRE,
    timeout: 45000,
  },
  async () => {
    const admin = new pg.Client({ connectionString: ADMIN });
    const db = createRestrictedApprovalDatabase({ connectionString: APP });
    const check = createApprovalSessionBroker({ db });
    await admin.connect();
    try {
      const exists = await admin.query("SELECT id FROM auth.users WHERE id IN ($1,$2)", [
        ACTOR,
        OTHER,
      ]);
      assert.equal(exists.rowCount, 0, "expected fresh CI fixture identities");
      await admin.query(
        "INSERT INTO auth.users(id,email) VALUES ($1,'r3b-actor@example.test'),($2,'r3b-other@example.test')",
        [ACTOR, OTHER],
      );
      await admin.query("INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)", [SESSION, ACTOR]);

      assert.equal(await check({ actor: ACTOR, sessionId: SESSION }), true);
      assert.equal(await check({ actor: OTHER, sessionId: SESSION }), false);
      assert.equal(await check({ actor: ACTOR, sessionId: UNKNOWN }), false);

      await assert.rejects(
        db.withTransaction((tx) => tx.query("SELECT id FROM auth.sessions LIMIT 1", [])),
        /permission denied/i,
      );

      await admin.query(
        "UPDATE auth.sessions SET not_after = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id=$1",
        [SESSION],
      );
      assert.equal(await check({ actor: ACTOR, sessionId: SESSION }), false);

      await admin.query("UPDATE auth.sessions SET not_after = NULL WHERE id=$1", [SESSION]);
      assert.equal(await check({ actor: ACTOR, sessionId: SESSION }), true);

      await admin.query("DELETE FROM auth.sessions WHERE id=$1", [SESSION]);
      assert.equal(await check({ actor: ACTOR, sessionId: SESSION }), false);

      // Default PUBLIC and unrelated roles must not execute the narrow broker RPC.
      const scope = await admin.query(`
      SELECT has_function_privilege('anon','alp_private.approval_session_active(uuid,uuid)','EXECUTE') AS anon,
             has_function_privilege('authenticated','alp_private.approval_session_active(uuid,uuid)','EXECUTE') AS authenticated,
             has_function_privilege('alp_academic_executor','alp_private.approval_session_active(uuid,uuid)','EXECUTE') AS academic,
             has_function_privilege('alp_approval_executor','alp_private.approval_session_active(uuid,uuid)','EXECUTE') AS approval,
             has_table_privilege('alp_approval_executor','auth.sessions','SELECT') AS direct_read
    `);
      assert.deepEqual(scope.rows[0], {
        anon: false,
        authenticated: false,
        academic: false,
        approval: true,
        direct_read: false,
      });
    } finally {
      try {
        await admin.query("DELETE FROM auth.sessions WHERE id=$1", [SESSION]);
      } catch {}
      try {
        await admin.query("DELETE FROM auth.users WHERE id IN ($1,$2)", [ACTOR, OTHER]);
      } catch {}
      await admin.end();
    }
  },
);
