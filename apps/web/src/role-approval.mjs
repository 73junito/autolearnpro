import pg from "pg";
const { Pool } = pg;
const maxBody = 8192;

async function assertRestrictedApprovalLogin(client) {
  const result = await client.query(
    "SELECT rolsuper, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = session_user"
  );
  if (result.rows.length !== 1 || result.rows[0].rolsuper !== false ||
      result.rows[0].rolbypassrls !== false || result.rows[0].rolinherit !== false) {
    throw new Error("approval database login must be nonprivileged and NOINHERIT");
  }
}
export function createRoleApproval({ authUrl = process.env.ALP_SUPABASE_URL, publishableKey = process.env.ALP_SUPABASE_PUBLISHABLE_KEY, databaseUrl = process.env.ALP_APPROVAL_DATABASE_URL, fetchImpl = fetch, pool: injectedPool } = {}) {
  const enabled = Boolean(authUrl && publishableKey && (databaseUrl || injectedPool));
  const pool = injectedPool ?? (databaseUrl ? new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 5000 }) : null);
  async function process(req, res) {
    const reply = (status, error) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ error }));
    };
    if (!enabled) return reply(503, "approval_service_unconfigured");
    const path = new URL(req.url, "http://localhost").pathname;
    if (req.method !== "POST" || !["/api/roles/request", "/api/roles/decision"].includes(path)) return reply(404, "not_found");
    const auth = req.headers.authorization;
    if (typeof auth !== "string" || !/^Bearer \S+$/.test(auth)) return reply(401, "unauthorized");
    let actor;
    try {
      const result = await fetchImpl(new URL("/auth/v1/user", authUrl), {
        headers: { authorization: auth, apikey: publishableKey }, signal: AbortSignal.timeout(5000)
      });
      if (!result.ok) return reply(401, "unauthorized");
      const user = await result.json();
      actor = user.id;
      if (typeof actor !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor)) return reply(401, "unauthorized");
    } catch { return reply(503, "auth_unavailable"); }
    // Rate limit is committed independently so denied/failed actions still count.
    // Row-level UPSERT serializes concurrent requests across server instances.
    let quotaClient;
    try {
      quotaClient = await pool.connect();
      await quotaClient.query("BEGIN");
      if (!injectedPool) await assertRestrictedApprovalLogin(quotaClient);
      await quotaClient.query("SET LOCAL ROLE alp_approval_executor");
      const quota = await quotaClient.query("SELECT alp_private.consume_approval_quota($1) AS allowed", [actor]);
      await quotaClient.query("COMMIT");
      if (quota.rows[0]?.allowed !== true) {
        // Record the rejected request in its own committed, private transaction.
        await quotaClient.query("BEGIN");
        if (!injectedPool) await assertRestrictedApprovalLogin(quotaClient);
      await quotaClient.query("SET LOCAL ROLE alp_approval_executor");
        await quotaClient.query("SELECT alp_private.record_approval_security_event($1,$2)", [actor, "approval_rate_limited"]);
        await quotaClient.query("COMMIT");
        res.setHeader("retry-after", "60");
        return reply(429, "rate_limited");
      }
    } catch {
      if (quotaClient) { try { await quotaClient.query("ROLLBACK"); } catch {} }
      return reply(503, "approval_unavailable");
    } finally { quotaClient?.release(); }
    let bodyText = "";
    try {
      for await (const chunk of req) {
        bodyText += chunk.toString();
        if (Buffer.byteLength(bodyText) > maxBody) return reply(413, "request_too_large");
      }
    } catch { return reply(400, "invalid_body"); }
    let body;
    try { body = JSON.parse(bodyText); } catch { return reply(400, "invalid_json"); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["targetId", "role", "reason", "requestId", "approve"].includes(k))) return reply(400, "invalid_fields");
    const reason = body.reason;
    if (typeof reason !== "string" || reason.trim().length < 8 || reason.trim().length > 350) return reply(400, "invalid_reason");
    const uuid = v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    const isRequest = path.endsWith("/request");
    if (isRequest && (!uuid(body.targetId) || !["student", "instructor", "administrator"].includes(body.role) || Object.keys(body).some(k => !["targetId", "role", "reason"].includes(k)))) return reply(400, "invalid_request");
    if (!isRequest && (!uuid(body.requestId) || typeof body.approve !== "boolean" || Object.keys(body).some(k => !["requestId", "approve", "reason"].includes(k)))) return reply(400, "invalid_decision");
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      if (!injectedPool) await assertRestrictedApprovalLogin(client);
      await client.query("SET LOCAL ROLE alp_approval_executor");
      let requestId;
      if (isRequest) {
        const result = await client.query("SELECT alp_private.submit_role_request($1,$2,$3,$4) AS id", [body.targetId, body.role, actor, reason]);
        requestId = result.rows[0].id;
      } else {
        await client.query("SELECT alp_private.decide_role_request($1,$2,$3,$4)", [body.requestId, actor, body.approve, reason]);
      }
      await client.query("COMMIT");
      res.writeHead(isRequest ? 201 : 200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(isRequest ? { requestId } : { status: "recorded" }));
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch { /* rollback best effort */ }
        if (error.code === "42501" || error.code === "22023") {
          try {
            await client.query("BEGIN");
            if (!injectedPool) await assertRestrictedApprovalLogin(client);
      await client.query("SET LOCAL ROLE alp_approval_executor");
            await client.query("SELECT alp_private.record_approval_security_event($1,$2)", [actor, error.code === "42501" ? "approval_denied" : "approval_invalid_state"]);
            await client.query("COMMIT");
          } catch { try { await client.query("ROLLBACK"); } catch {} }
        }
      }
      // Do not expose SQL errors or authorization details.
      reply(error.code === "42501" ? 403 : error.code === "22023" ? 409 : 503, error.code === "42501" ? "forbidden" : error.code === "22023" ? "invalid_state" : "approval_unavailable");
    } finally { client?.release(); }
  }
  return { enabled, process, close: () => pool?.end() };
}
