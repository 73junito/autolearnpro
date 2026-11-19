import test from "node:test";
import assert from "node:assert/strict";
import { createRestrictedApprovalDatabase } from "../apps/web/src/worker-approval-postgres.mjs";

function harness({
  loginRole = "alp_approval_worker_login",
  executorRole = "alp_approval_executor",
  failAt = null,
} = {}) {
  const statements = [];
  const clients = [];
  const factory = (config) => {
    const client = {
      config,
      ended: false,
      async connect() {
        statements.push("CONNECT");
        if (failAt === "CONNECT") throw Error("connect failure");
      },
      async query(sql, params) {
        statements.push(sql);
        if (sql === failAt) throw Error("synthetic failure " + sql);
        if (sql.startsWith("SELECT session_user"))
          return {
            rowCount: 1,
            rows: [{ login_role: loginRole, executor_role: executorRole }],
          };
        return { rowCount: 1, rows: [{ allowed: true, params }] };
      },
      async end() {
        statements.push("END");
        this.ended = true;
        if (failAt === "END") throw Error("end failure");
      },
    };
    clients.push(client);
    return client;
  };
  return {
    db: createRestrictedApprovalDatabase({
      connectionString: "postgres://synthetic.example/db",
      clientFactory: factory,
    }),
    statements,
    clients,
  };
}

test("R2 must be configured and refuse a missing connection", () => {
  assert.throws(() => createRestrictedApprovalDatabase(), /unconfigured/);
  assert.throws(
    () => createRestrictedApprovalDatabase({ connectionString: "", clientFactory: () => ({}) }),
    /unconfigured/,
  );
});

test("R2 executes BEGIN, a static SET LOCAL ROLE, checks both identities, then commits and closes", async () => {
  const { db, statements, clients } = harness();
  const result = await db.withTransaction(async (tx) =>
    tx.query("SELECT alp_private.consume_approval_quota_signed($1,$2,$3,$4)", [
      "x",
      1,
      "nonce",
      "sig",
    ]),
  );
  assert.equal(result.rows[0].allowed, true);
  assert.deepEqual(statements, [
    "CONNECT",
    "BEGIN",
    "SET LOCAL ROLE alp_approval_executor",
    "SELECT session_user AS login_role, current_user AS executor_role",
    "SELECT alp_private.consume_approval_quota_signed($1,$2,$3,$4)",
    "COMMIT",
    "END",
  ]);
  assert.equal(clients[0].config.query_timeout, 10000);
  assert.equal(clients[0].config.connectionTimeoutMillis, 5000);
  assert.equal(clients[0].ended, true);
});

test("R2 rejects privileged-login substitution and rolls back before any action", async () => {
  const { db, statements } = harness({ loginRole: "postgres" });
  let invoked = false;
  await assert.rejects(
    db.withTransaction(() => {
      invoked = true;
    }),
    /identity mismatch/,
  );
  assert.equal(invoked, false);
  assert.deepEqual(statements.slice(-2), ["ROLLBACK", "END"]);
  assert.ok(!statements.includes("COMMIT"));
});

test("R2 rejects a wrong current executor role", async () => {
  const { db, statements } = harness({ executorRole: "service_role" });
  await assert.rejects(
    db.withTransaction(async () => {}),
    /identity mismatch/,
  );
  assert.equal(statements.includes("ROLLBACK"), true);
  assert.equal(statements.includes("COMMIT"), false);
});

test("R2 always rolls back a rejected transaction callback and closes client", async () => {
  const { db, statements } = harness();
  await assert.rejects(
    db.withTransaction(async (tx) => {
      await tx.query("SELECT 1", []);
      throw Error("approval refused");
    }),
    /approval refused/,
  );
  assert.deepEqual(statements.slice(-3), ["SELECT 1", "ROLLBACK", "END"]);
});

test("R2 connection failure never executes BEGIN, action or COMMIT", async () => {
  const { db, statements } = harness({ failAt: "CONNECT" });
  await assert.rejects(
    db.withTransaction(async () => assert.fail("unreachable")),
    /connect failure/,
  );
  assert.deepEqual(statements, ["CONNECT", "END"]);
});

test("R2 SQL failure rolls back and retains original error", async () => {
  const { db, statements } = harness({ failAt: "SELECT 1" });
  await assert.rejects(
    db.withTransaction((tx) => tx.query("SELECT 1", [])),
    /synthetic failure SELECT 1/,
  );
  assert.deepEqual(statements.slice(-3), ["SELECT 1", "ROLLBACK", "END"]);
});

test("R2 commit failure attempts rollback and closes", async () => {
  const { db, statements } = harness({ failAt: "COMMIT" });
  await assert.rejects(
    db.withTransaction(async () => 1),
    /synthetic failure COMMIT/,
  );
  assert.deepEqual(statements.slice(-3), ["COMMIT", "ROLLBACK", "END"]);
});

test("R2 after-commit cleanup errors are failures, not successful commits", async () => {
  const { db, statements } = harness({ failAt: "END" });
  await assert.rejects(
    db.withTransaction(async () => 1),
    /end failure/,
  );
  assert.deepEqual(statements.slice(-2), ["COMMIT", "END"]);
});

test("R2 does not reuse a connection or allow queries after transaction completion", async () => {
  const { db, statements, clients } = harness();
  let stored;
  await db.withTransaction((tx) => {
    stored = tx;
    return tx.query("SELECT 1", []);
  });
  assert.throws(() => stored.query("SELECT 1", []), /no longer active/);
  await db.withTransaction((tx) => tx.query("SELECT 2", []));
  assert.equal(clients.length, 2);
  assert.equal(statements.filter((s) => s === "BEGIN").length, 2);
  assert.equal(statements.filter((s) => s === "END").length, 2);
});

test("R2 requires parameterized query inputs", async () => {
  const { db, statements } = harness();
  await assert.rejects(
    db.withTransaction((tx) => tx.query("SELECT 1")),
    /parameterized/,
  );
  assert.deepEqual(statements.slice(-2), ["ROLLBACK", "END"]);
});
