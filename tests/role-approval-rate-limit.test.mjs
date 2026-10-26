import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../apps/web/src/server.mjs";
import { createRoleApproval } from "../apps/web/src/role-approval.mjs";

test("per-actor local throttle blocks seventh attempt before database access", async t => {
  let queries = 0;
  let consumed = 0;
  const pool = {
    connect: async () => ({ query: async (sql) => {
      queries++;
      if (sql.includes("consume_approval_quota")) return { rows: [{ allowed: ++consumed <= 6 }] };
      if (sql.includes("submit_role_request")) return { rows: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] };
      return { rows: [] };
    }, release() {} }),
    async end() {}
  };
  const approval = createRoleApproval({
    authUrl: "http://127.0.0.1:1", publishableKey: "public-test-key", pool,
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) })
  });
  const server = makeServer({ approval });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/roles/request`;
  const post = () => fetch(url, {
    method: "POST", headers: { authorization: "Bearer verified", "content-type": "application/json" },
    body: JSON.stringify({ targetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "instructor", reason: "Approved role test reason" })
  });
  for (let i = 0; i < 6; i++) assert.equal((await post()).status, 201);
  const before = queries;
  const seventh = await post();
  assert.equal(seventh.status, 429);
  assert.equal(seventh.headers.get("retry-after"), "60");
  assert.equal(queries, before + 8); // two transactions: quota and security event; no mutation query
  assert.equal(consumed, 7);
});
