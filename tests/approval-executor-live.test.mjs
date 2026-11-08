import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import pg from "pg";
import { makeServer } from "../apps/web/src/server.mjs";
import { createRoleApproval } from "../apps/web/src/role-approval.mjs";

const ADMIN = process.env.ALP_APPROVAL_CI_ADMIN_URL;
const APP = process.env.ALP_APPROVAL_CI_APP_URL;
const MARKER = process.env.ALP_R1_EXPECTED_MARKER;
const REQUIRED = process.env.ALP_APPROVAL_CI_REQUIRE === "1";
const requester = "77777777-7777-4777-8777-777777777777";
const target = "88888888-8888-4888-8888-888888888888";
const reviewer = "99999999-9999-4999-8999-999999999999";
const outsider = "aaaaaaaa-1111-4111-8111-111111111111";
const ids = [requester, target, reviewer, outsider];

if (REQUIRED && (!ADMIN || !APP || !MARKER)) {
  throw new Error("Approval live gate requires marked admin and restricted app connections");
}

function localOnly(raw) {
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.port !== "55132" || url.pathname !== "/postgres") {
    throw new Error("Approval CI refuses non-scratch DB URL");
  }
  return url;
}

if (ADMIN || APP) {
  if (!ADMIN || !APP || !MARKER) throw new Error("Incomplete approval CI configuration");
  const a = localOnly(ADMIN);
  const b = localOnly(APP);
  if (a.hostname !== b.hostname || a.port !== b.port ||
      a.pathname !== b.pathname || b.username !== "alp_approval_ci_login") {
    throw new Error("Approval CI database targets/login mismatch");
  }
}

test("R1 dedicated approval executor: authorization and narrow privileges", {
  skip: !ADMIN, timeout: 45000,
}, async () => {
  const admin = new pg.Pool({ connectionString: ADMIN, max: 2 });
  const app = new pg.Pool({ connectionString: APP, max: 2 });
  let server;
  try {
    const marker = await admin.query("SELECT token FROM alp_verification.marker");
    assert.equal(marker.rows[0]?.token, MARKER, "scratch marker must match before any writes");
    const history = await admin.query("SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations");
    assert.equal(history.rows[0]?.n, 22);
    const role = await admin.query(
      "SELECT rolcanlogin, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='alp_approval_executor'"
    );
    assert.deepEqual(role.rows[0], { rolcanlogin: false, rolsuper: false, rolbypassrls: false });
    const isolation = await app.query(
      "SELECT rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=session_user"
    );
    assert.deepEqual(isolation.rows[0], { rolsuper: false, rolbypassrls: false, rolinherit: false });
    await assert.rejects(app.query("SELECT id FROM auth.users LIMIT 1"), /permission denied/i);
    await assert.rejects(app.query("SELECT id FROM public.alp_courses LIMIT 1"), /permission denied/i);
    await assert.rejects(app.query("SET ROLE service_role"), /permission denied/i);
    await assert.rejects(app.query("SELECT * FROM alp_private.alp_role_assignments"), /permission denied/i);

    await admin.query(
      "INSERT INTO auth.users(id,email) SELECT x, 'approval-ci-'||x::text||'@example.test' FROM unnest($1::uuid[]) AS x",
      [ids]
    );
    await admin.query(
      "INSERT INTO alp_private.alp_role_assignments(user_id,role_name) VALUES ($1,'administrator')",
      [reviewer]
    );
    const fetchImpl = async (_url, options) => {
      const token = options.headers.authorization.replace("Bearer ", "");
      return ids.includes(token)
        ? { ok: true, json: async () => ({ id: token }) }
        : { ok: false };
    };
    const approval = createRoleApproval({
      authUrl: "http://127.0.0.1:1", publishableKey: "ci-only",
      databaseUrl: APP, fetchImpl,
    });
    server = makeServer({
      approval, academic: { process() {}, async close() {} },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (path, actor, body) => fetch(base + path, {
      method: "POST",
      headers: { authorization: `Bearer ${actor}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    let res = await post("/api/roles/request", requester, {
      targetId: target, role: "instructor", reason: "CI role application"
    });
    assert.equal(res.status, 201, "restricted login must submit request");
    const { requestId } = await res.json();
    assert.ok(requestId);
    res = await post("/api/roles/decision", outsider, {
      requestId, approve: true, reason: "CI unauthorized decision"
    });
    assert.equal(res.status, 403, "outsider cannot approve");
    res = await post("/api/roles/decision", requester, {
      requestId, approve: true, reason: "CI forbidden self approval"
    });
    assert.equal(res.status, 403, "self approval is denied");
    res = await post("/api/roles/decision", reviewer, {
      requestId, approve: true, reason: "CI approved instructor role"
    });
    assert.equal(res.status, 200);
    res = await post("/api/roles/decision", reviewer, {
      requestId, approve: true, reason: "CI duplicate approval refused"
    });
    assert.equal(res.status, 409);
    const granted = await admin.query(
      "SELECT 1 FROM alp_private.alp_role_assignments WHERE user_id=$1 AND role_name='instructor'",
      [target]
    );
    assert.equal(granted.rowCount, 1);

    res = await post("/api/roles/request", requester, {
      targetId: target, role: "administrator", reason: "CI independent admin review required"
    });
    assert.equal(res.status, 201);
    const highRequestId = (await res.json()).requestId;
    res = await post("/api/roles/decision", reviewer, {
      requestId: highRequestId, approve: true, reason: "CI administrator escalation denied"
    });
    assert.equal(res.status, 403, "administrator elevation remains blocked");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const id of [...ids].reverse()) {
      await admin.query("DELETE FROM alp_private.alp_security_events WHERE actor_id=$1", [id]);
      await admin.query("DELETE FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1", [id]);
      await admin.query("DELETE FROM alp_private.alp_role_audit WHERE user_id=$1 OR actor_id=$1", [id]);
      await admin.query("DELETE FROM alp_private.alp_role_requests WHERE target_id=$1 OR requested_by=$1 OR decided_by=$1", [id]);
      await admin.query("DELETE FROM auth.users WHERE id=$1", [id]);
    }
    await app.end();
    await admin.end();
  }
});
