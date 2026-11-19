import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import pg from "pg";

const REQUIRED = process.env.ALP_R7C_CI_REQUIRE === "1";
const PROJECT = "autolearnpro-foundation6";
const ADMIN = process.env.ALP_R7C_CI_ADMIN_URL;
const LOGIN = process.env.ALP_R7C_CI_LOGIN_URL;
const SIGNER = process.env.ALP_R7C_CI_ATTESTATION_KEY;
const AUTH = "http://127.0.0.1:55121";
function onlyDisposable(value, user) {
  if (!value) throw Error("R7C missing local database URL");
  const u = new URL(value);
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    u.port !== "55132" ||
    u.pathname !== "/postgres" ||
    u.username !== user
  )
    throw Error("R7C refuses non-disposable PostgreSQL connection");
}
if (REQUIRED) {
  if (process.env.CI !== "true" || process.env.ALP_R7C_CI_PROJECT_ID !== PROJECT)
    throw Error("R7C requires explicit disposable GitHub CI marker");
  onlyDisposable(ADMIN, "postgres");
  onlyDisposable(LOGIN, "alp_approval_worker_login");
  if (!/^[a-f0-9]{64}$/i.test(SIGNER || "")) throw Error("R7C requires synthetic signing material");
}
async function authRequest(key, url, method, body, bearer) {
  const response = await fetch(AUTH + "/auth/v1" + url, {
    method,
    headers: {
      apikey: key,
      ...(bearer ? { authorization: "Bearer " + bearer } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}
function claims(token) {
  const parts = token?.split(".");
  if (parts?.length !== 3) throw Error("R7C expected signed GoTrue JWT");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.match(payload.sub, /^[0-9a-f-]{36}$/i);
  assert.match(payload.session_id, /^[0-9a-f-]{36}$/i);
  assert.ok(payload.exp > Date.now() / 1000);
  return payload;
}
test(
  "R7C public approval entrypoint in real workerd: GoTrue, signed writes, Hyperdrive, logout and failure boundaries",
  {
    skip: !REQUIRED,
    timeout: 120000,
  },
  async () => {
    const dir = mkdtempSync(path.join(process.cwd(), ".r7c-workerd-"));
    const bundle = path.join(dir, "entry.mjs");
    const admin = new pg.Client({ connectionString: ADMIN, connectionTimeoutMillis: 5000 });
    let runtime, authOutage, apiKey;
    const users = [];
    let requestId;
    await admin.connect();
    try {
      const marker = await admin.query("SELECT token FROM alp_verification.marker");
      assert.equal(marker.rowCount, 1, "disposable scratch marker required");
      const status = spawnSync("supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      });
      assert.equal(status.status, 0, "local Supabase status unavailable");
      const configuration = JSON.parse(status.stdout);
      apiKey = configuration.ANON_KEY || configuration.PUBLISHABLE_KEY;
      assert.ok(typeof apiKey === "string" && apiKey.length > 20);
      assert.ok(
        !configuration.API_URL || configuration.API_URL === AUTH,
        "GoTrue endpoint is not the local project",
      );

      async function createUser() {
        const email = "r7c-" + randomUUID() + "@example.test";
        const password = "R7c!" + randomBytes(24).toString("base64url") + "9a";
        const signup = await authRequest(apiKey, "/signup", "POST", { email, password });
        assert.equal(signup.status, 200, "actual GoTrue sign-up rejected");
        const userId = signup.data?.user?.id || signup.data?.id;
        assert.ok(userId);
        users.push(userId);
        let token = signup.data?.access_token;
        if (!token) {
          const login = await authRequest(apiKey, "/token?grant_type=password", "POST", {
            email,
            password,
          });
          assert.equal(login.status, 200, "GoTrue password login failed");
          token = login.data?.access_token;
        }
        assert.equal(claims(token).sub, userId);
        return { userId, token };
      }
      const actor = await createUser();
      const target = await createUser();
      assert.notEqual(claims(actor.token).session_id, claims(target.token).session_id);

      // Compile the ACTUAL source-only public Worker, not a test-specific route.
      await build({
        entryPoints: ["apps/web/src/worker-approval-entrypoint.mjs"],
        outfile: bundle,
        bundle: true,
        platform: "node",
        format: "esm",
        target: "es2022",
        external: ["node:*"],
        conditions: ["workerd", "worker", "browser"],
        logLevel: "silent",
        banner: {
          js: "import { createRequire as __r7cCreateRequire } from 'node:module'; import { EventEmitter as __r7cEventEmitter } from 'node:events'; const __r7cRequire=__r7cCreateRequire('file:///r7c-entry.mjs'); const require=(name)=>name==='events'||name==='node:events'?{EventEmitter:__r7cEventEmitter}:__r7cRequire(name);",
        },
      });
      const options = {
        scriptPath: bundle,
        modules: true,
        compatibilityDate: "2026-08-06",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          SUPABASE_AUTH_URL: AUTH,
          SUPABASE_PUBLISHABLE_KEY: apiKey,
          APPROVAL_ATTESTATION_KEY: SIGNER,
        },
        hyperdrives: { APPROVAL_HYPERDRIVE: LOGIN },
      };
      runtime = new Miniflare(options);
      async function post(worker, route, token, body) {
        const response = await worker.dispatchFetch("http://r7c.invalid" + route, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: "Bearer " + token } : {}),
          },
          body: JSON.stringify(body),
        });
        return {
          status: response.status,
          headers: response.headers,
          body: await response.json().catch(() => null),
        };
      }
      const valid = {
        targetId: target.userId,
        role: "instructor",
        reason: "R7C worker transport integration request",
      };
      let response = await post(runtime, "/api/roles/request", null, valid);
      assert.equal(response.status, 401, "missing bearer must deny");
      response = await post(runtime, "/api/roles/request", actor.token, valid);
      assert.equal(response.status, 201, "real authenticated signed approval request must commit");
      requestId = response.body?.requestId;
      assert.match(requestId, /^[0-9a-f-]{36}$/i);
      let record = await admin.query(
        "SELECT state,requested_by,target_id FROM alp_private.alp_role_requests WHERE id=$1",
        [requestId],
      );
      assert.equal(record.rows[0]?.state, "pending");
      assert.equal(record.rows[0]?.requested_by, actor.userId);
      assert.equal(record.rows[0]?.target_id, target.userId);

      response = await post(runtime, "/api/roles/decision", actor.token, {
        requestId,
        approve: true,
        reason: "R7C unauthorized self approval attempt",
      });
      assert.equal(response.status, 403, "non-admin requester cannot approve");
      record = await admin.query("SELECT state FROM alp_private.alp_role_requests WHERE id=$1", [
        requestId,
      ]);
      assert.equal(record.rows[0]?.state, "pending", "denied approval changed persistent state");
      const countBefore = await admin.query(
        "SELECT attempts FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1",
        [actor.userId],
      );
      assert.ok(countBefore.rows[0]?.attempts >= 2);

      const loggedOut = await authRequest(apiKey, "/logout?scope=local", "POST", null, actor.token);
      assert.ok([200, 204].includes(loggedOut.status), "GoTrue local logout failed");
      response = await post(runtime, "/api/roles/request", actor.token, valid);
      assert.equal(response.status, 401, "revoked but unexpired JWT authorized Worker");
      const countAfter = await admin.query(
        "SELECT attempts FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1",
        [actor.userId],
      );
      assert.equal(
        countAfter.rows[0]?.attempts,
        countBefore.rows[0]?.attempts,
        "revoked JWT must be denied before quota mutation",
      );

      response = await post(runtime, "/api/roles/request", target.token, {
        targetId: "not-a-uuid",
        role: "instructor",
        reason: "R7C invalid request",
      });
      assert.equal(response.status, 400, "surviving GoTrue session should reach validation");
      const global = await authRequest(apiKey, "/logout?scope=global", "POST", null, target.token);
      assert.ok([200, 204].includes(global.status), "GoTrue global logout failed");
      response = await post(runtime, "/api/roles/request", target.token, valid);
      assert.equal(response.status, 401, "global-logged-out JWT authorized Worker");
      const forged = target.token.slice(0, -2) + "AA";
      response = await post(runtime, "/api/roles/request", forged, valid);
      assert.equal(response.status, 401, "tampered bearer authorized Worker");
      for (const userId of users) {
        const sessions = await admin.query(
          "SELECT count(*)::int AS count FROM auth.sessions WHERE user_id=$1",
          [userId],
        );
        assert.equal(sessions.rows[0].count, 0, "GoTrue logout left an active CI session");
      }

      // A disconnected GoTrue endpoint must not permit a write.
      authOutage = new Miniflare({
        ...options,
        bindings: {
          ...options.bindings,
          SUPABASE_AUTH_URL: "http://127.0.0.1:9",
        },
      });
      response = await post(authOutage, "/api/roles/request", actor.token, valid);
      assert.equal(response.status, 503, "GoTrue outage must fail closed");

      console.log(
        "R7C PASS: real public workerd entrypoint + GoTrue + Hyperdrive + signed request + denied decision + logout",
      );
    } finally {
      if (authOutage) await authOutage.dispose();
      if (runtime) await runtime.dispose();
      if (requestId)
        await admin
          .query("DELETE FROM alp_private.alp_role_requests WHERE id=$1", [requestId])
          .catch(() => {});
      for (const id of users.reverse()) {
        await admin
          .query("DELETE FROM alp_private.alp_security_events WHERE actor_id=$1", [id])
          .catch(() => {});
        await admin
          .query("DELETE FROM alp_private.alp_approval_rate_limits WHERE actor_id=$1", [id])
          .catch(() => {});
        await admin.query("DELETE FROM auth.sessions WHERE user_id=$1", [id]).catch(() => {});
        await admin.query("DELETE FROM auth.users WHERE id=$1", [id]).catch(() => {});
      }
      await admin.end().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
