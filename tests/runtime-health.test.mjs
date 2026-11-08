import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../apps/web/src/server.mjs";

test("web health endpoint is healthy without external services", async (t) => {
  const server = makeServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok", service: "autolearnpro-web" });
  const missing = await fetch(`${base}/not-found`);
  assert.equal(missing.status, 404);
  const post = await fetch(`${base}/health`, { method: "POST" });
  assert.equal(post.status, 404);
});
