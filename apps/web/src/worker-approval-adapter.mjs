import { hasValidAttestationKey, signWorkerApproval } from "./approval-attestation-worker.mjs";
import { verifiedBearerSession } from "./approval-session-claims.mjs";

// D02-E source-only Cloudflare Workers adapter.
// The database port is deliberately injected. This is NOT a deployed Worker:
// a restricted, transaction-safe Workers/PostgreSQL transport is still required.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 8192;
const ALLOWED_ROLES = new Set(["student", "instructor", "administrator"]);

function json(status, data, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

async function boundedJson(request) {
  if (
    request.headers.has("content-length") &&
    Number(request.headers.get("content-length")) > MAX_BODY
  ) {
    return { error: "request_too_large", status: 413 };
  }
  const chunks = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (!reader) return { error: "invalid_body", status: 400 };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY) {
        await reader.cancel().catch(() => {});
        return { error: "request_too_large", status: 413 };
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    let body;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(out));
    } catch {
      return { error: "invalid_json", status: 400 };
    }
    if (!body || Array.isArray(body) || typeof body !== "object") {
      return { error: "invalid_fields", status: 400 };
    }
    return { body };
  } catch {
    return { error: "invalid_body", status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function validatedBody(path, body) {
  const request = path === "/api/roles/request";
  const keys = request ? ["targetId", "role", "reason"] : ["requestId", "approve", "reason"];
  if (Object.keys(body).some((key) => !keys.includes(key))) return false;
  if (
    typeof body.reason !== "string" ||
    body.reason.trim().length < 8 ||
    body.reason.trim().length > 350
  )
    return false;
  if (request) return UUID.test(body.targetId) && ALLOWED_ROLES.has(body.role);
  return UUID.test(body.requestId) && typeof body.approve === "boolean";
}

function statusOf(error) {
  if (error?.code === "42501") return [403, "forbidden"];
  if (error?.code === "22023") return [409, "invalid_state"];
  return [503, "approval_unavailable"];
}

// Expected database port: db.withTransaction(async tx => tx.query(sql, params)).
// Must provide a real transaction, restricted approval login and SET LOCAL ROLE.
// It must not accept caller SQL, a privileged owner login or a shared mock in production.
export function createWorkerApprovalHandler({
  authUrl,
  publishableKey,
  attestationKey,
  db,
  fetchImpl = fetch,
  signOperation = signWorkerApproval,
  checkSession,
} = {}) {
  const enabled = Boolean(
    authUrl &&
    publishableKey &&
    hasValidAttestationKey(attestationKey) &&
    db &&
    typeof db.withTransaction === "function" &&
    typeof checkSession === "function",
  );

  async function signedQuery(tx, operation, actor, args, sql, params) {
    const proof = await signOperation(attestationKey, operation, actor, args);
    return tx.query(sql, [...params, ...proof]);
  }

  // Session row lock and signed mutation MUST use the SAME database
  // transaction/client. A concurrent session UPDATE/DELETE cannot commit
  // between the lock acquisition and the privileged write's commit.
  async function assertSessionLocked(tx, { actor, sessionId }) {
    const locked = await tx.query(
      "SELECT alp_private.lock_approval_actor_session($1::uuid,$2::uuid) AS locked",
      [actor, sessionId],
    );
    if (locked?.rows?.[0]?.locked !== true || locked.rows.length !== 1) {
      const error = new Error("verified approval session no longer active");
      error.code = "42501";
      throw error;
    }
  }

  async function verifyBearer(value) {
    if (typeof value !== "string" || !/^Bearer \S+$/.test(value)) return { status: 401 };
    try {
      const response = await fetchImpl(new URL("/auth/v1/user", authUrl), {
        method: "GET",
        headers: { authorization: value, apikey: publishableKey },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { status: 401 };
      const user = await response.json();
      if (!UUID.test(user?.id)) return { status: 401 };
      const bearer = value.slice(7);
      const identity = verifiedBearerSession(bearer, user.id);
      if (!identity) return { status: 401 };
      // A validated JWT can remain unexpired after logout; require
      // an independent trusted check of the current session record.
      const active = await checkSession(identity);
      if (active !== true) return { status: 401 };
      return { ...identity, status: 200 };
    } catch {
      return { status: 503 };
    }
  }

  return {
    enabled,
    async fetch(request) {
      if (!enabled) return json(503, { error: "approval_service_unconfigured" });
      const path = new URL(request.url).pathname;
      if (
        request.method !== "POST" ||
        !["/api/roles/request", "/api/roles/decision"].includes(path)
      ) {
        return json(404, { error: "not_found" });
      }
      const identity = await verifyBearer(request.headers.get("authorization"));
      if (!identity.actor) {
        return json(identity.status, {
          error: identity.status === 401 ? "unauthorized" : "auth_unavailable",
        });
      }
      const actor = identity.actor;
      // Quota deliberately commits in a separate transaction, including bad requests.
      let quota;
      try {
        quota = await db.withTransaction((tx) =>
          signedQuery(
            tx,
            "quota",
            actor,
            [],
            "SELECT alp_private.consume_approval_quota_signed($1,$2,$3,$4) AS allowed",
            [actor],
          ),
        );
      } catch {
        return json(503, { error: "approval_unavailable" });
      }
      if (quota?.rows?.[0]?.allowed !== true) {
        try {
          await db.withTransaction((tx) =>
            signedQuery(
              tx,
              "event",
              actor,
              ["approval_rate_limited"],
              "SELECT alp_private.record_approval_security_event_signed($1,$2,$3,$4,$5)",
              [actor, "approval_rate_limited"],
            ),
          );
        } catch {
          /* event best effort; return denial regardless */
        }
        return json(429, { error: "rate_limited" }, { "retry-after": "60" });
      }

      const parsed = await boundedJson(request);
      if (!parsed.body) return json(parsed.status, { error: parsed.error });
      if (!validatedBody(path, parsed.body)) return json(400, { error: "invalid_fields" });
      const body = parsed.body;
      // Recheck after the quota transaction, before the privileged write.
      try {
        if (
          (await checkSession({ actor: identity.actor, sessionId: identity.sessionId })) !== true
        ) {
          return json(401, { error: "unauthorized" });
        }
      } catch {
        return json(503, { error: "auth_unavailable" });
      }
      const isRequest = path.endsWith("/request");
      try {
        let result;
        if (isRequest) {
          result = await db.withTransaction(async (tx) => {
            await assertSessionLocked(tx, identity);
            return signedQuery(
              tx,
              "submit",
              actor,
              [body.targetId, body.role, body.reason],
              "SELECT alp_private.submit_role_request_signed($1,$2,$3,$4,$5,$6,$7) AS id",
              [body.targetId, body.role, actor, body.reason],
            );
          });
          return json(201, { requestId: result.rows[0].id });
        }
        await db.withTransaction(async (tx) => {
          await assertSessionLocked(tx, identity);
          return signedQuery(
            tx,
            "decide",
            actor,
            [body.requestId, body.approve, body.reason],
            "SELECT alp_private.decide_role_request_signed($1,$2,$3,$4,$5,$6,$7)",
            [body.requestId, actor, body.approve, body.reason],
          );
        });
        return json(200, { status: "recorded" });
      } catch (error) {
        if (error?.code === "42501" || error?.code === "22023") {
          const event = error.code === "42501" ? "approval_denied" : "approval_invalid_state";
          try {
            await db.withTransaction((tx) =>
              signedQuery(
                tx,
                "event",
                actor,
                [event],
                "SELECT alp_private.record_approval_security_event_signed($1,$2,$3,$4,$5)",
                [actor, event],
              ),
            );
          } catch {
            /* preserve original status */
          }
        }
        const [status, name] = statusOf(error);
        return json(status, { error: name });
      }
    },
  };
}
