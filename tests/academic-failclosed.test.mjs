import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../apps/web/src/server.mjs";
import { createAcademic } from "../apps/web/src/academic.mjs";

// Permanent R8 regression: a refused PostgreSQL acquisition must fail closed,
// for reads and writes, without exposing the underlying connection failure.
for (const [method, path, body] of [
  ["GET", "/api/academic/courses", undefined],
  ["POST", "/api/academic/enrollments", { courseId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }]
]) {
  test(`academic database unavailable: ${method} ${path} returns 503`, async (t) => {
    let attempts = 0;
    const pool = {
      async connect() {
        attempts++;
        const e = new Error("connection refused");
        e.code = "ECONNREFUSED";
        throw e;
      },
      async end() {}
    };
    const academic = createAcademic({
      authUrl: "http://127.0.0.1:1",
      publishableKey: "local-test-key",
      pool,
      fetchImpl: async () => ({ ok: true, json: async () => ({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }) })
    });
    const server = makeServer({ academic });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => server.close());
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { authorization: "Bearer test", "content-type": "application/json" },
      ...(body && { body: JSON.stringify(body) })
    });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "academic_unavailable" });
    assert.ok(attempts >= 1);
  });
}
