import test from "node:test";
import assert from "node:assert/strict";
import { createRestrictedApprovalDatabase } from "../apps/web/src/worker-approval-postgres.mjs";

const REQUIRE = process.env.ALP_R2_CI_REQUIRE === "1";
const DATABASE = process.env.ALP_R2_CI_DATABASE_URL;
if (REQUIRE && !DATABASE) throw new Error("R2 live gate requires disposable database");
if (DATABASE) {
  const url = new URL(DATABASE);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "55132" ||
    url.pathname !== "/postgres" ||
    url.username !== "alp_approval_worker_login"
  ) {
    throw new Error("R2 live gate refuses non-disposable database or wrong login");
  }
}

test(
  "R2 real PostgreSQL transaction: restricted approval Worker identity and rollback",
  {
    skip: !REQUIRE,
    timeout: 30000,
  },
  async () => {
    const db = createRestrictedApprovalDatabase({ connectionString: DATABASE });
    const check = await db.withTransaction((tx) => tx.query("SELECT current_user AS role", []));
    assert.equal(check.rows[0]?.role, "alp_approval_executor");

    await assert.rejects(
      db.withTransaction((tx) => tx.query("SELECT id FROM auth.users LIMIT 1", [])),
      /permission denied/i,
    );

    await assert.rejects(
      db.withTransaction((tx) =>
        tx.query("SELECT alp_private.submit_role_request($1,$2,$3,$4)", [
          "88888888-8888-4888-8888-888888888888",
          "instructor",
          "77777777-7777-4777-8777-777777777777",
          "Unsigned actor spoof attempt must fail",
        ]),
      ),
      /permission denied/i,
    );

    await assert.rejects(
      db.withTransaction(async (tx) => {
        const r = await tx.query("SELECT current_user AS role", []);
        assert.equal(r.rows[0]?.role, "alp_approval_executor");
        throw new Error("forced application rollback");
      }),
      /forced application rollback/,
    );

    const repeat = await db.withTransaction((tx) => tx.query("SELECT 1 AS ready", []));
    assert.equal(repeat.rows[0]?.ready, 1);
  },
);
