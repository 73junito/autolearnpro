import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import pg from "pg";
import { makeServer } from "../apps/web/src/server.mjs";
import { createRoleApproval } from "../apps/web/src/role-approval.mjs";

test("live local Supabase Auth and PostgreSQL approval lifecycle", { timeout: 45000, skip: !process.env.ALP_LOCAL_INTEGRATION }, async t => {
  const supabaseUrl = process.env.ALP_SUPABASE_URL;
  const publicKey = process.env.ALP_SUPABASE_PUBLISHABLE_KEY;
  const databaseUrl = process.env.ALP_DATABASE_URL;
  assert.ok(supabaseUrl?.startsWith("http://127.0.0.1:55121"));
  assert.ok(publicKey && databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ids = [];
  const server = makeServer({ approval: createRoleApproval({ authUrl: supabaseUrl, publishableKey: publicKey, pool }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const runId = crypto.randomUUID().replaceAll("-", "");
  const password = "Local-Test-7!" + crypto.randomUUID();
  const signup = async role => {
    const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST", headers: { apikey: publicKey, "content-type": "application/json" },
      body: JSON.stringify({ email: `f7-${role}-${runId}@example.test`, password })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.user?.id && data.access_token);
    ids.push(data.user.id);
    return { id: data.user.id, token: data.access_token };
  };
  const post = (path, token, body) => fetch(base + path, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  try {
    const requester = await signup("requester");
    const target = await signup("target");
    const reviewer = await signup("reviewer");
    const stranger = await signup("stranger");
    // Local test fixture: administrator bootstrap is a trusted database-owner action.
    await pool.query("INSERT INTO alp_private.alp_role_assignments(user_id,role_name) VALUES ($1,'administrator')", [reviewer.id]);
    const body = { targetId: target.id, role: "instructor", reason: "Verified instructor credentials in local test" };
    let res = await post("/api/roles/request", requester.token, body);
    assert.equal(res.status, 201);
    const { requestId } = await res.json();
    assert.ok(requestId);
    res = await post("/api/roles/decision", stranger.token, { requestId, approve: true, reason: "Unauthorized approval attempted" });
    assert.equal(res.status, 403);
    const denial = await pool.query("SELECT count(*)::int AS count FROM alp_private.alp_security_events WHERE actor_id=$1 AND event_name='approval_denied'", [stranger.id]);
    assert.equal(denial.rows[0].count, 1);
    res = await post("/api/roles/decision", requester.token, { requestId, approve: true, reason: "Self approval attempted locally" });
    assert.equal(res.status, 403);
    res = await post("/api/roles/decision", reviewer.token + "tampered", { requestId, approve: true, reason: "Forged token attempted locally" });
    assert.equal(res.status, 401);
    res = await post("/api/roles/decision", reviewer.token, { requestId, approve: true, reason: "Reviewed instructor credentials" });
    assert.equal(res.status, 200);
    res = await post("/api/roles/decision", reviewer.token, { requestId, approve: true, reason: "Second approval must be refused" });
    assert.equal(res.status, 409);
    const granted = await pool.query("SELECT role_name FROM alp_private.alp_role_assignments WHERE user_id=$1 AND role_name='instructor'", [target.id]);
    assert.equal(granted.rowCount, 1);
    const audited = await pool.query("SELECT actor_id FROM alp_private.alp_role_audit WHERE user_id=$1 AND role_name='instructor' AND action='grant'", [target.id]);
    assert.equal(audited.rowCount, 1);
    assert.equal(audited.rows[0].actor_id, reviewer.id);
    const approval = await pool.query("SELECT state,decided_by FROM alp_private.alp_role_requests WHERE id=$1", [requestId]);
    assert.equal(approval.rows[0].state, "approved");
    assert.equal(approval.rows[0].decided_by, reviewer.id);
  } finally {
    for (const id of ids.reverse()) {
      await pool.query("DELETE FROM alp_private.alp_security_events WHERE actor_id=$1", [id]);
      await pool.query("DELETE FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1", [id]);
      await pool.query("DELETE FROM alp_private.alp_role_audit WHERE user_id=$1 OR actor_id=$1", [id]);
      await pool.query("DELETE FROM alp_private.alp_role_requests WHERE target_id=$1 OR requested_by=$1 OR decided_by=$1", [id]);
      await pool.query("DELETE FROM auth.users WHERE id=$1", [id]);
    }
    await new Promise(resolve => server.close(resolve));
  }
});
