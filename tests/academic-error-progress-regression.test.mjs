import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../apps/web/src/server.mjs";
import { createAcademic } from "../apps/web/src/academic.mjs";

for (const scenario of [
  ["network rejection", async () => { throw new Error("network connection refused"); }],
  ["timeout", async () => { throw new Error("The operation was aborted due to timeout"); }],
  ["invalid JSON", async () => ({ ok: true, json: async () => { throw new SyntaxError("malformed"); } })],
]) {
  test(`academic auth transport failure is fail-closed: ${scenario[0]}`, async (t) => {
    let connects = 0;
    const pool = { connect: async () => { connects++; throw new Error("must not connect"); }, end: async () => {} };
    const academic = createAcademic({
      authUrl: "http://127.0.0.1:1", publishableKey: "test-key", pool,
      fetchImpl: scenario[1],
    });
    const server = makeServer({ academic });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise(resolve => server.close(resolve)));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/academic/courses`, {
      headers: { authorization: "Bearer test-token" },
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "academic_auth_unavailable" });
    assert.equal(connects, 0, "must not touch the database if verification fails");
  });
}

test("progress status contract accepts started and rejects not_started before DB writes", async (t) => {
  const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const progress = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const operations = [];
  const pool = {
    async connect() {
      return {
        async query(sql, params=[]) {
          operations.push({ sql, params });
          if (sql.includes("consume_academic_quota")) return { rows:[{ allowed:true }] };
          if (sql.includes("FROM public.alp_academic_progress WHERE id")) return { rows:[{ id:progress, student_id:actor }] };
          return { rows:[], rowCount:0 };
        },
        release() {}
      };
    },
    async end() {}
  };
  const academic = createAcademic({
    authUrl: "http://127.0.0.1:1", publishableKey: "test-key", pool,
    fetchImpl: async () => ({ok:true,json:async()=>({id:actor})}),
  });
  const server = makeServer({ academic });
  server.listen(0, "127.0.0.1");
  await once(server,"listening");
  t.after(() => new Promise(resolve=>server.close(resolve)));
  const uri = `http://127.0.0.1:${server.address().port}/api/academic/progress/${progress}`;
  const request = (status) => fetch(uri, {
    method:"PUT",
    headers:{ authorization:"Bearer test", "content-type":"application/json" },
    body:JSON.stringify({status}),
  });
  let response = await request("not_started");
  assert.equal(response.status,400);
  assert.deepEqual(await response.json(),{error:"invalid_status"});
  assert.equal(operations.some(x=>x.sql.includes("UPDATE public.alp_academic_progress")),false);
  response = await request("started");
  assert.equal(response.status,200);
  assert.equal((await response.json()).progress.status,"started");
  assert.equal(operations.filter(x=>x.sql.includes("UPDATE public.alp_academic_progress")).length,1);
});

test("academic dispatch catches unexpected rejected handler promises", async (t) => {
  const academic = {
    process: async () => { throw new Error("unexpected failure"); },
    close: async () => {},
  };
  const server = makeServer({ academic });
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  t.after(() => new Promise(resolve=>server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/academic/courses`, {
    signal:AbortSignal.timeout(2000),
  });
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:"academic_unavailable"});
});
