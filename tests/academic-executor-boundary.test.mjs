import test from "node:test";
import assert from "node:assert/strict";
import { createAcademic } from "../apps/web/src/academic.mjs";

// Unit-level R1 contract: only the verified actor can be bound to RLS.
test("academic restricted identity query uses the verified actor", async () => {
  const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const operations = [];
  const pool = {
    async connect() {
      return { query: async (sql, params) => {
        operations.push({sql, params});
        if (sql.includes("consume_academic_quota")) return { rows: [{allowed:true}] };
        return {rows:[], rowCount:0};
      }, release() {} };
    },
    async end() {}
  };
  const service = createAcademic({
    authUrl: "http://localhost:1", publishableKey: "unit-test",
    pool, fetchImpl: async () => ({ok:true, json:async()=>({id:actor})})
  });
  const req = {url:"/api/academic/courses",method:"GET",headers:{authorization:"Bearer test"}};
  let status;
  const res = { writeHead: (code)=>{status=code;}, end:()=>{}, setHeader:()=>{} };
  await service.process(req,res);
  assert.equal(status,200);
  const roles=operations.filter(o=>o.sql==="SET LOCAL ROLE alp_academic_executor");
  const claims=operations.filter(o=>o.sql.includes("set_config("));
  assert.equal(roles.length,2);
  assert.equal(claims.length,2);
  assert.ok(claims.every(o=>o.params.length===1 && o.params[0]===actor));
  assert.ok(!operations.some(o=>o.sql.includes("SET LOCAL ROLE service_role")));
  await service.close();
});
