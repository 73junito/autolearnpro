import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { createRestrictedApprovalDatabase } from "../apps/web/src/worker-approval-postgres.mjs";
import { createApprovalSessionBroker } from "../apps/web/src/worker-approval-session-broker.mjs";
import { createWorkerApprovalHandler } from "../apps/web/src/worker-approval-adapter.mjs";

const REQUIRE = process.env.ALP_R6_CI_REQUIRE === "1";
const ADMIN_URL = process.env.ALP_R6_CI_DATABASE_URL;
const WORKER_URL = process.env.ALP_R6_CI_WORKER_DATABASE_URL;
const ATTESTATION_KEY = process.env.ALP_R6_CI_ATTESTATION_KEY;
const PROJECT = "autolearnpro-foundation6";
const AUTH_URL = "http://127.0.0.1:55121";

function checkLocal(raw, username) {
  if (!raw) throw Error("R6 missing disposable database URL");
  const u = new URL(raw);
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    u.port !== "55132" ||
    u.pathname !== "/postgres" ||
    u.username !== username
  ) {
    throw Error("R6 refuses non-disposable database connection");
  }
}
if (REQUIRE) {
  if (process.env.CI !== "true" || process.env.ALP_R6_CI_PROJECT_ID !== PROJECT)
    throw Error("R6 requires explicit disposable GitHub CI");
  checkLocal(ADMIN_URL, "postgres");
  checkLocal(WORKER_URL, "alp_approval_worker_login");
  if (!/^[a-f0-9]{64}$/i.test(ATTESTATION_KEY || ""))
    throw Error("R6 synthetic signer unavailable");
}

function jwtSession(token) {
  const segments = token.split(".");
  if (segments.length !== 3) throw Error("GoTrue returned invalid JWT");
  const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  if (
    !/^[a-f0-9-]{36}$/i.test(payload.sub || "") ||
    !/^[a-f0-9-]{36}$/i.test(payload.session_id || "") ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw Error("GoTrue returned missing, expired or malformed actor-session claims");
  }
  return { actor: payload.sub, sessionId: payload.session_id };
}
async function http(apiKey, resource, method, body, token) {
  const r = await fetch(AUTH_URL + "/auth/v1" + resource, {
    method,
    headers: {
      apikey: apiKey,
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
  });
  // Callers must check status; never print auth response bodies or bearer tokens.
  return { response: r, data: await r.json().catch(() => null) };
}

test(
  "R6 real GoTrue local/global logout blocks stale JWTs at restricted approval handler",
  {
    skip: !REQUIRE,
    timeout: 60000,
  },
  async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    const userEmail = "r6-" + randomUUID() + "@example.test";
    const password = "R6!" + randomBytes(24).toString("base64url") + "9a";
    let userId;
    try {
      const marker = await admin.query("SELECT token FROM alp_verification.marker");
      assert.equal(marker.rowCount, 1, "disposable project marker required");
      // The pinned CLI provides a local publishable/anon key: no hosted API keys.
      const { spawnSync } = await import("node:child_process");
      const status = spawnSync("supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      });
      assert.equal(status.status, 0, "local Supabase status unavailable");
      const config = JSON.parse(status.stdout);
      const apiKey = config.ANON_KEY || config.PUBLISHABLE_KEY;
      assert.ok(typeof apiKey === "string" && apiKey.length > 20, "missing local gateway API key");
      assert.ok(
        !config.API_URL || config.API_URL === AUTH_URL,
        "R6 refuses mismatched GoTrue API host",
      );

      // Register and sign in through actual local GoTrue, not fixture SQL.
      const signup = await http(apiKey, "/signup", "POST", { email: userEmail, password });
      assert.equal(signup.response.status, 200, "GoTrue signup failed");
      userId = signup.data?.user?.id || signup.data?.id;
      assert.ok(userId, "GoTrue did not return user identity");
      let first = signup.data?.access_token;
      if (!first) {
        const login = await http(apiKey, "/token?grant_type=password", "POST", {
          email: userEmail,
          password,
        });
        assert.equal(login.response.status, 200, "GoTrue password login failed");
        first = login.data?.access_token;
      }
      assert.ok(first, "GoTrue did not issue first access token");
      const secondResult = await http(apiKey, "/token?grant_type=password", "POST", {
        email: userEmail,
        password,
      });
      assert.equal(secondResult.response.status, 200, "second GoTrue sign-in failed");
      const second = secondResult.data?.access_token;
      assert.ok(second && second !== first, "second sign-in must issue distinct JWT");
      const one = jwtSession(first),
        two = jwtSession(second);
      assert.equal(one.actor, userId);
      assert.equal(two.actor, userId);
      assert.notEqual(one.sessionId, two.sessionId);

      const db = createRestrictedApprovalDatabase({ connectionString: WORKER_URL });
      const checkSession = createApprovalSessionBroker({ db });
      assert.equal(await checkSession(one), true);
      assert.equal(await checkSession(two), true);
      const handler = createWorkerApprovalHandler({
        authUrl: AUTH_URL,
        publishableKey: apiKey,
        attestationKey: ATTESTATION_KEY,
        db,
        fetchImpl: fetch,
        checkSession,
      });
      assert.equal(handler.enabled, true);

      // Invalid request body intentionally prevents the privileged mutation.
      // A valid session must reach validation (400), not be denied at auth (401).
      async function probe(token) {
        return handler.fetch(
          new Request("https://worker.invalid/api/roles/request", {
            method: "POST",
            headers: { authorization: "Bearer " + token, "content-type": "application/json" },
            body: JSON.stringify({ targetId: "not-a-uuid", role: "instructor", reason: "R6 test" }),
          }),
        );
      }
      const before = await probe(first);
      assert.equal(before.status, 400, "live GoTrue token did not pass approval authentication");

      const local = await http(apiKey, "/logout?scope=local", "POST", null, first);
      assert.ok(
        local.response.status === 204 || local.response.status === 200,
        "local logout request failed",
      );
      assert.equal(await checkSession(one), false, "local logout did not remove first session");
      assert.equal(await checkSession(two), true, "local logout incorrectly revoked other session");

      // GoTrue may accept the still-unexpired JWT; approval MUST NOT.
      const after = await probe(first);
      assert.equal(after.status, 401, "revoked access token passed approval authorization");
      const survivor = await probe(second);
      assert.equal(survivor.status, 400, "surviving GoTrue session was incorrectly denied");

      const global = await http(apiKey, "/logout?scope=global", "POST", null, second);
      assert.ok(
        global.response.status === 204 || global.response.status === 200,
        "global logout failed",
      );
      assert.equal(await checkSession(two), false, "global logout did not remove second session");
      assert.equal(
        (await probe(second)).status,
        401,
        "global-logged-out token authorized approval",
      );

      // A tampered token must fail GoTrue verification and never reach quota.
      const invalid = second.slice(0, -2) + "AA";
      assert.equal((await probe(invalid)).status, 401, "tampered JWT passed GoTrue");
      const remaining = await admin.query(
        "SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1",
        [userId],
      );
      assert.equal(remaining.rows[0].n, 0);
    } finally {
      if (userId) {
        try {
          await admin.query("DELETE FROM auth.sessions WHERE user_id=$1", [userId]);
        } catch {}
        try {
          await admin.query("DELETE FROM auth.users WHERE id=$1", [userId]);
        } catch {}
      }
      await admin.end();
    }
  },
);
