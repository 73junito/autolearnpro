import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../apps/web/src/server.mjs";
import { createRoleApproval } from "../apps/web/src/role-approval.mjs";

const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const target = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
test("role approval HTTP: fail closed, verified actor, and negative paths", async t => {
  const statements = [];
  const pool = {
    connect: async () => ({
      query: async (sql, params) => {
        statements.push({ sql, params });
        if (sql.includes("consume_approval_quota")) return { rows: [{ allowed: true }] };
        if (sql.includes("submit_role_request")) return { rows: [{ id: requestId }] };
        return { rows: [] };
      },
      release: () => {}
    }),
    end: async () => {}
  };
  let valid = true;
  const approval = createRoleApproval({
    authUrl: "http://127.0.0.1:1", publishableKey: "public-test-key", pool,
    fetchImpl: async () => valid ? { ok: true, json: async () => ({ id: actor }) } : { ok: false }
  });
  const server = makeServer({ approval });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, token = "valid") => fetch(base + path, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const request = { targetId: target, role: "instructor", reason: "Instructor verified for pilot" };
  let r = await post("/api/roles/request", request);
  assert.equal(r.status, 201);
  assert.equal((await r.json()).requestId, requestId);
  const submitted = statements.find(s => s.sql.includes("submit_role_request"));
  assert.deepEqual(submitted.params, [target, "instructor", actor, request.reason]);
  assert.ok(statements.some(s => s.sql === "SET LOCAL ROLE service_role"));
  r = await post("/api/roles/decision", { requestId, approve: true, reason: "Verified and approved" });
  assert.equal(r.status, 200);
  const decided = statements.find(s => s.sql.includes("decide_role_request"));
  assert.deepEqual(decided.params, [requestId, actor, true, "Verified and approved"]);
  const initialCount = statements.length;
  r = await post("/api/roles/request", { ...request, actorId: target });
  assert.equal(r.status, 400);
  assert.equal(statements.length, initialCount + 4); // quota counted but no mutation
  valid = false;
  r = await post("/api/roles/decision", { requestId, approve: true, reason: "Verified and approved" }, "forged");
  assert.equal(r.status, 401);
  assert.equal(statements.length, initialCount + 4);
  // A malformed Auth user ID must be rejected before any SQL operation.
  const invalidIdentity = createRoleApproval({
    authUrl: "http://127.0.0.1:1", publishableKey: "public-test-key", pool,
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: "aaaaaaaa-invalid-4aaa-8aaa-aaaaaaaaaaaa" }) })
  });
  const invalidServer = makeServer({ approval: invalidIdentity });
  invalidServer.listen(0, "127.0.0.1");
  await once(invalidServer, "listening");
  t.after(() => invalidServer.close());
  const beforeInvalid = statements.length;
  const invalidResponse = await fetch(`http://127.0.0.1:${invalidServer.address().port}/api/roles/request`, {
    method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify(request)
  });
  assert.equal(invalidResponse.status, 401);
  assert.equal(statements.length, beforeInvalid);
  r = await fetch(base + "/api/roles/request", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(r.status, 401);
  const disabled = makeServer({ approval: createRoleApproval({}) });
  disabled.listen(0, "127.0.0.1");
  await once(disabled, "listening");
  t.after(() => disabled.close());
  const unavailable = await fetch(`http://127.0.0.1:${disabled.address().port}/api/roles/request`, { method: "POST" });
  assert.equal(unavailable.status, 503);
});
