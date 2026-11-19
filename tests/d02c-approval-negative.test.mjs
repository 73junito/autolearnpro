import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../apps/web/src/server.mjs";
import { createRoleApproval } from "../apps/web/src/role-approval.mjs";

// D02-C: entirely synthetic handler tests. No external auth, SQL connections,
// environment-provided credentials, or Cloudflare resources are used.
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const reason = "Synthetic authorized review reason";
const body = { targetId: B, role: "student", reason };

function createHarness({ verify, failConnect = false, failSqlCode = null } = {}) {
  const statements = [];
  let connections = 0;
  const pool = {
    async connect() {
      connections++;
      if (failConnect) throw new Error("synthetic private connection error");
      return {
        async query(sql, params = []) {
          statements.push({ sql, params });
          if (failSqlCode && sql.includes("submit_role_request")) {
            const error = new Error("synthetic SQL detail must remain private");
            error.code = failSqlCode;
            throw error;
          }
          if (sql.includes("consume_approval_quota")) return { rows: [{ allowed: true }] };
          if (sql.includes("submit_role_request")) return { rows: [{ id: REQUEST_ID }] };
          return { rows: [] };
        },
        release() {}
      };
    },
    async end() {}
  };
  const approval = createRoleApproval({
    authUrl: "https://synthetic-auth.invalid",
    publishableKey: "synthetic-public-key",
    pool,
    attestationKey: "a".repeat(64),
    fetchImpl: verify ?? (async (_url, options) => {
      const token = options.headers.authorization;
      const id = token === "Bearer token-a" ? A : token === "Bearer token-b" ? B : null;
      return id ? { ok: true, json: async () => ({ id }) } : { ok: false };
    })
  });
  const inertAcademic = { async process() {}, async close() {} };
  return {
    server: makeServer({ approval, academic: inertAcademic }),
    statements,
    get connections() { return connections; }
  };
}

async function withServer(t, harness) {
  harness.server.listen(0, "127.0.0.1");
  await once(harness.server, "listening");
  t.after(() => new Promise(resolve => harness.server.close(resolve)));
  const base = `http://127.0.0.1:${harness.server.address().port}`;
  return (path, token, value = body) => fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) },
    body: JSON.stringify(value)
  });
}

test("D02-C C01/C02: missing and rejected bearer never access database", async t => {
  const harness = createHarness();
  const post = await withServer(t, harness);
  for (const token of [undefined, "Bearer invalid", "Basic token-a", "Bearer "]) {
    const response = await post("/api/roles/request", token);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  }
  assert.equal(harness.connections, 0);
  assert.equal(harness.statements.length, 0);
});

test("D02-C C03: GoTrue outage fails closed without SQL", async t => {
  const harness = createHarness({
    verify: async () => { throw new Error("synthetic GoTrue unavailable"); }
  });
  const post = await withServer(t, harness);
  const response = await post("/api/roles/request", "Bearer token-a");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "auth_unavailable" });
  assert.equal(harness.connections, 0);
  assert.equal(harness.statements.length, 0);
});

test("D02-C C04: actorId injection never reaches privileged SQL", async t => {
  const harness = createHarness();
  const post = await withServer(t, harness);
  const response = await post("/api/roles/request", "Bearer token-a", {
    ...body, actorId: B
  });
  assert.equal(response.status, 400);
  assert.equal(harness.statements.filter(s => /submit_role_request|decide_role_request/.test(s.sql)).length, 0);
});

test("D02-C C05/C06: verified bearer determines SQL actor, not request JSON", async t => {
  const harness = createHarness();
  const post = await withServer(t, harness);
  const submitted = await post("/api/roles/request", "Bearer token-a");
  assert.equal(submitted.status, 201);
  const submit = harness.statements.find(s => s.sql.includes("submit_role_request"));
  assert.deepEqual(submit?.params.slice(0, 4), [B, "student", A, reason]);

  const decided = await post("/api/roles/decision", "Bearer token-b", {
    requestId: REQUEST_ID, approve: false, reason
  });
  assert.equal(decided.status, 200);
  const decide = harness.statements.find(s => s.sql.includes("decide_role_request"));
  assert.deepEqual(decide?.params.slice(0, 4), [REQUEST_ID, B, false, reason]);
});

test("D02-C C15: database unavailable returns generic 503 without SQL error details", async t => {
  const harness = createHarness({ failConnect: true });
  const post = await withServer(t, harness);
  const response = await post("/api/roles/request", "Bearer token-a");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "approval_unavailable" });
  assert.equal(harness.statements.length, 0);
});

test("D02-C C07/C08: privileged SQL denial is mapped to 403 without leaking details", async t => {
  // This simulates rejection by the database; it does not prove the database
  // implementation enforces self-approval or administrator membership.
  const harness = createHarness({ failSqlCode: "42501" });
  const post = await withServer(t, harness);
  const response = await post("/api/roles/request", "Bearer token-a");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.ok(harness.statements.some(s => s.sql === "ROLLBACK"));
  assert.equal(harness.statements.filter(s => s.sql === "COMMIT").length, 2);
});
