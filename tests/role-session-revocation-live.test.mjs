import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { once } from "node:events";
import { makeServer } from "../apps/web/src/server.mjs";
import { createRoleApproval } from "../apps/web/src/role-approval.mjs";

test("local Auth session revocation rejects a previously issued approval bearer", { skip: !process.env.ALP_LOCAL_INTEGRATION, timeout: 40000 }, async () => {
  const url=process.env.ALP_SUPABASE_URL, key=process.env.ALP_SUPABASE_PUBLISHABLE_KEY, db=process.env.ALP_DATABASE_URL;
  assert.ok(url?.startsWith("http://127.0.0.1:55121") && key && db);
  const pool=new pg.Pool({connectionString:db});
  const server=makeServer({approval:createRoleApproval({authUrl:url,publishableKey:key,pool})});
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  let id;
  try {
    const email=`f7-revoke-${crypto.randomUUID()}@example.test`;
    const signup=await fetch(url+"/auth/v1/signup",{method:"POST",headers:{apikey:key,"content-type":"application/json"},body:JSON.stringify({email,password:"Local-Revocation!"+crypto.randomUUID()})});
    assert.equal(signup.status,200);
    const user=await signup.json(); id=user.user.id; const token=user.access_token;
    assert.ok(token);
    const endpoint=`http://127.0.0.1:${server.address().port}/api/roles/request`;
    const send=()=>fetch(endpoint,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({targetId:id,role:"student",reason:"Local revocation probe"})});
    assert.equal((await send()).status,201);
    const out=await fetch(url+"/auth/v1/logout",{method:"POST",headers:{apikey:key,authorization:`Bearer ${token}`}});
    assert.equal(out.status,204);
    const after=await send();
    assert.equal(after.status,401,`revoked token still granted approval endpoint access (HTTP ${after.status})`);
  } finally {
    if(id) {
      await pool.query("DELETE FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1",[id]);
      await pool.query("DELETE FROM alp_private.alp_role_requests WHERE requested_by=$1 OR target_id=$1",[id]);
      await pool.query("DELETE FROM auth.users WHERE id=$1",[id]);
    }
    await new Promise(resolve=>server.close(resolve));
  }
});
