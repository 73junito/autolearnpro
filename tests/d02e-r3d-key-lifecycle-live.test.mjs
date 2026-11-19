import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { signWorkerApproval } from "../apps/web/src/approval-attestation-worker.mjs";

const ADMIN = process.env.ALP_R3D_CI_ADMIN_URL;
const APP = process.env.ALP_R3D_CI_APP_URL;
const LEGACY_KEY = process.env.ALP_APPROVAL_ATTESTATION_KEY;
const REQUIRE = process.env.ALP_R3D_CI_REQUIRE === "1";
function localOnly(raw, expectedUser) {
  if (!raw) throw Error("R3D must use marked disposable CI database");
  const u = new URL(raw);
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    u.port !== "55132" ||
    u.pathname !== "/postgres" ||
    u.username !== expectedUser
  )
    throw Error("R3D refuses non-disposable target");
}
if (REQUIRE) {
  localOnly(ADMIN, "postgres");
  localOnly(APP, "alp_approval_worker_login");
  if (!/^[0-9a-f]{64}$/i.test(LEGACY_KEY || "")) throw Error("R3D synthetic signer missing");
}

test(
  "R3D rotation, retiring overlap, replay and emergency revoke use only private admin RPCs",
  {
    skip: !REQUIRE,
    timeout: 50000,
  },
  async () => {
    const admin = new pg.Client({ connectionString: ADMIN });
    const app = new pg.Client({ connectionString: APP });
    const actor = randomUUID();
    const key2 = randomBytes(32).toString("hex");
    const key3 = randomBytes(32).toString("hex");
    const reusedNonce = randomUUID();

    async function verify(key, options) {
      const proof = await signWorkerApproval(key, "quota", actor, [], options);
      await app.query("BEGIN");
      try {
        await app.query("SET LOCAL ROLE alp_approval_executor");
        const result = await app.query(
          "SELECT alp_private.consume_approval_quota_signed($1,$2,$3,$4) AS allowed",
          [actor, ...proof],
        );
        await app.query("COMMIT");
        return result.rows[0];
      } catch (e) {
        await app.query("ROLLBACK");
        throw e;
      }
    }
    await admin.connect();
    await app.connect();
    try {
      const marker = await admin.query("SELECT token FROM alp_verification.marker");
      assert.equal(marker.rowCount, 1, "disposable marker required");
      await admin.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
        actor,
        `r3d-${actor}@example.test`,
      ]);
      const before = await admin.query(
        "SELECT key_id,state,not_after FROM alp_private.alp_approval_attestation_keys ORDER BY key_id",
      );
      assert.deepEqual(
        before.rows.map((x) => [x.key_id, x.state]),
        [[1, "active"]],
      );
      assert.equal(before.rows[0].not_after, null);

      await verify(LEGACY_KEY, { nonce: reusedNonce });

      await admin.query(
        "SELECT alp_private.rotate_approval_attestation_key($1,decode($2,'hex'),$3)",
        [2, key2, 45],
      );
      // Transition accepts BOTH old/retiring and new/active proofs.
      await verify(LEGACY_KEY);
      await verify(key2);

      // A signed proof with the same nonce cannot be replayed under a new key.
      await assert.rejects(verify(key2, { nonce: reusedNonce }), /replayed approval attestation/i);
      await assert.rejects(
        admin.query("SELECT alp_private.rotate_approval_attestation_key($1,decode($2,'hex'),$3)", [
          3,
          key3,
          10,
        ]),
        /overlap still active/i,
      );
      await assert.rejects(
        admin.query("SELECT alp_private.rotate_approval_attestation_key($1,decode($2,'hex'),$3)", [
          2,
          key3,
          0,
        ]),
        /overlap still active|identifiers cannot be reused/i,
      );

      const revokedOld = await admin.query(
        "SELECT alp_private.revoke_approval_attestation_key($1) AS revoked",
        [1],
      );
      assert.equal(revokedOld.rows[0].revoked, true);
      await assert.rejects(verify(LEGACY_KEY), /key revoked|mismatch/i);
      await verify(key2);

      const emergency = await admin.query(
        "SELECT alp_private.emergency_revoke_approval_attestations() AS count",
      );
      assert.equal(emergency.rows[0].count, 1);
      await assert.rejects(verify(key2), /key revoked|mismatch/i);

      // Recovery requires a new random key and unused identifier; never resurrect revoked bytes.
      await admin.query(
        "SELECT alp_private.rotate_approval_attestation_key($1,decode($2,'hex'),$3)",
        [3, key3, 0],
      );
      await verify(key3);
      await assert.rejects(verify(key2), /key revoked|mismatch/i);

      const grants = await admin.query(`
      SELECT has_function_privilege('alp_approval_executor',
             'alp_private.rotate_approval_attestation_key(integer,bytea,integer)','EXECUTE') AS executor_rotate,
             has_function_privilege('alp_approval_executor',
             'alp_private.revoke_approval_attestation_key(integer)','EXECUTE') AS executor_revoke,
             has_function_privilege('authenticated',
             'alp_private.emergency_revoke_approval_attestations()','EXECUTE') AS client_emergency,
             has_table_privilege('alp_approval_executor',
             'alp_private.alp_approval_attestation_keys','SELECT') AS executor_key_read
    `);
      assert.deepEqual(grants.rows[0], {
        executor_rotate: false,
        executor_revoke: false,
        client_emergency: false,
        executor_key_read: false,
      });
      const events = await admin.query(
        "SELECT event_type,key_id FROM alp_private.alp_approval_key_events ORDER BY event_id",
      );
      assert.deepEqual(
        events.rows.map((x) => x.event_type),
        ["rotate", "revoke", "emergency_revoke", "rotate"],
      );
    } finally {
      await app.end();
      try {
        await admin.query("DELETE FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1", [
          actor,
        ]);
      } catch {}
      try {
        await admin.query("DELETE FROM auth.users WHERE id=$1", [actor]);
      } catch {}
      await admin.end();
    }
  },
);
