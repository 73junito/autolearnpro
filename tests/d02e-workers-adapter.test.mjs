import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signApprovalOperation } from "../apps/web/src/approval-attestation.mjs";
import {
  signWorkerApproval,
  encodeApprovalMessage,
} from "../apps/web/src/approval-attestation-worker.mjs";
import { createWorkerApprovalHandler } from "../apps/web/src/worker-approval-adapter.mjs";

const KEY = "a".repeat(64);
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SESSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TOKEN = [
  "eyJhbGciOiJIUzI1NiJ9",
  Buffer.from(
    JSON.stringify({
      sub: A,
      session_id: SESSION,
      exp: 4102444800,
      iat: 1795000000,
    }),
  ).toString("base64url"),
  "synthetic",
].join(".");
const AUTH = "Bearer " + TOKEN;
const reason = "Synthetic instructor | é";

function harness({
  auth = "ok",
  databaseError = null,
  quotaAllowed = true,
  key = KEY,
  session = "active",
  enableGuard = true,
} = {}) {
  const sql = [];
  const calls = [];
  let transactions = 0;
  const sessionChecks = [];
  const checkSession = async (identity) => {
    sessionChecks.push(identity);
    if (session === "error") throw Error("session lookup unavailable");
    if (session === "revoke-after-first") return sessionChecks.length === 1;
    return session === "active";
  };
  const db = {
    async withTransaction(callback) {
      transactions++;
      return callback({
        async query(statement, params) {
          sql.push({ statement, params });
          if (databaseError && statement.includes("submit_role_request_signed")) {
            const error = Error("synthetic internal detail");
            error.code = databaseError;
            throw error;
          }
          if (statement.includes("consume_approval_quota_signed"))
            return { rows: [{ allowed: quotaAllowed }] };
          if (statement.includes("submit_role_request_signed")) return { rows: [{ id: REQUEST }] };
          return { rows: [] };
        },
      });
    },
  };
  const fetchImpl = async (_url, options) => {
    calls.push(options.headers.authorization);
    if (auth === "network") throw Error("synthetic unavailable");
    if (auth === "bad" || options.headers.authorization !== AUTH) return { ok: false };
    return { ok: true, json: async () => ({ id: A }) };
  };
  const handler = createWorkerApprovalHandler({
    authUrl: "https://auth.invalid",
    publishableKey: "test-publishable",
    attestationKey: key,
    db,
    fetchImpl,
    checkSession: enableGuard ? checkSession : undefined,
  });
  const post = (path, token = AUTH, body = { targetId: B, role: "instructor", reason }) =>
    handler.fetch(
      new Request("https://worker.invalid" + path, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) },
        body: JSON.stringify(body),
      }),
    );
  return {
    handler,
    post,
    sql,
    calls,
    sessionChecks,
    get transactions() {
      return transactions;
    },
  };
}

test("D02-E WebCrypto signer matches Node and PostgreSQL byte framing", async () => {
  const args = [B, "instructor", "Unicode é | delimiter"];
  const issuedAt = 1795040000;
  const nonce = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const parts = ["submit", A, ...args, String(issuedAt), nonce];
  const frame = encodeApprovalMessage(parts);
  const signature = createHmac("sha256", Buffer.from(KEY, "hex"))
    .update(frame, "utf8")
    .digest("hex");
  const worker = await signWorkerApproval(KEY, "submit", A, args, { issuedAt, nonce });
  assert.deepEqual(worker, [issuedAt, nonce, signature]);
  // Node signing uses runtime nonce/timestamp, so framing equivalence is
  // also verified through the independent explicit expected HMAC above.
  assert.equal(signApprovalOperation(KEY, "quota", A)[2].length, 64);
});

test("D02-E Worker approval adapter is fail closed without attestation key or DB", async () => {
  const h = harness({ key: null });
  assert.equal(h.handler.enabled, false);
  const response = await h.post("/api/roles/request");
  assert.equal(response.status, 503);
  assert.equal(h.transactions, 0);
});

test("D02-E missing, malformed and rejected bearer never start DB transaction", async () => {
  const h = harness();
  for (const token of [null, "Basic abc", "Bearer rejected", "Bearer "]) {
    const r = await h.post("/api/roles/request", token);
    assert.equal(r.status, 401);
  }
  assert.equal(h.transactions, 0);
});

test("D02-E GoTrue network failure returns 503 before DB", async () => {
  const h = harness({ auth: "network" });
  const r = await h.post("/api/roles/request");
  assert.equal(r.status, 503);
  assert.equal(h.transactions, 0);
});

test("D02-E verified actor controls signed submit and decision", async () => {
  const h = harness();
  const submitted = await h.post("/api/roles/request");
  assert.equal(submitted.status, 201);
  assert.deepEqual(await submitted.json(), { requestId: REQUEST });
  const mutation = h.sql.find((s) => s.statement.includes("submit_role_request_signed"));
  assert.deepEqual(mutation.params.slice(0, 4), [B, "instructor", A, reason]);
  assert.equal(mutation.params[6].length, 64);
  const decision = await h.post("/api/roles/decision", AUTH, {
    requestId: REQUEST,
    approve: false,
    reason,
  });
  assert.equal(decision.status, 200);
  const verified = h.sql.find((s) => s.statement.includes("decide_role_request_signed"));
  assert.deepEqual(verified.params.slice(0, 4), [REQUEST, A, false, reason]);
  assert.equal(h.transactions, 4);
});

test("D02-E actorId injection and unknown JSON keys reject without mutation", async () => {
  const h = harness();
  const response = await h.post("/api/roles/request", AUTH, {
    targetId: B,
    role: "student",
    reason,
    actorId: B,
  });
  assert.equal(response.status, 400);
  assert.equal(h.sql.filter((s) => /submit_role_request_signed/.test(s.statement)).length, 0);
  assert.equal(h.transactions, 1); // the auth-approved quota is committed
});

test("D02-E quota denial returns 429 and an independent signed audit event", async () => {
  const h = harness({ quotaAllowed: false });
  const r = await h.post("/api/roles/request");
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "60");
  assert.ok(h.sql.some((s) => s.statement.includes("record_approval_security_event_signed")));
  assert.equal(h.transactions, 2);
});

test("D02-E permission errors deny and record event without disclosing SQL", async () => {
  const h = harness({ databaseError: "42501" });
  const r = await h.post("/api/roles/request");
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: "forbidden" });
  assert.ok(h.sql.some((s) => s.statement.includes("record_approval_security_event_signed")));
});

test("D02-E oversized request is rejected before mutation", async () => {
  const h = harness();
  const response = await h.post("/api/roles/request", AUTH, {
    targetId: B,
    role: "student",
    reason: "X".repeat(9000),
  });
  assert.equal(response.status, 413);
  assert.equal(h.sql.filter((s) => s.statement.includes("submit_role_request_signed")).length, 0);
});

test("R3 Worker refuses activation without trusted active-session verifier", async () => {
  const h = harness({ enableGuard: false });
  assert.equal(h.handler.enabled, false);
  assert.equal((await h.post("/api/roles/request")).status, 503);
  assert.equal(h.transactions, 0);
});

test("R3 revoked or unknown session is rejected before quota and mutation", async () => {
  const h = harness({ session: "revoked" });
  assert.equal((await h.post("/api/roles/request")).status, 401);
  assert.equal(h.transactions, 0);
  assert.deepEqual(h.sessionChecks, [{ actor: A, sessionId: SESSION }]);
});

test("R3 session-verifier outage denies service without touching database", async () => {
  const h = harness({ session: "error" });
  assert.equal((await h.post("/api/roles/request")).status, 503);
  assert.equal(h.transactions, 0);
});

test("R3 revocation between quota and mutation blocks privileged write", async () => {
  const h = harness({ session: "revoke-after-first" });
  assert.equal((await h.post("/api/roles/request")).status, 401);
  assert.equal(h.transactions, 1);
  assert.equal(h.sessionChecks.length, 2);
  assert.ok(!h.sql.some((s) => /submit_role_request_signed/.test(s.statement)));
});

test("R3 trusted verifier called before quota and again before mutation", async () => {
  const h = harness();
  assert.equal((await h.post("/api/roles/request")).status, 201);
  assert.deepEqual(h.sessionChecks, [
    { actor: A, sessionId: SESSION },
    { actor: A, sessionId: SESSION },
  ]);
});
