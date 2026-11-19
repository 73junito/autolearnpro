import { createWorkerApprovalHandler } from "./worker-approval-adapter.mjs";
import { createApprovalSessionBroker } from "./worker-approval-session-broker.mjs";

// Cloudflare-compatible Worker module; no process.env, owner credentials,
// mock sessions or ambient database connection fallback.
function safeLocalAuth(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      (u.protocol === "https:" ||
        (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash
    );
  } catch {
    return false;
  }
}
function credentials(env) {
  const authUrl = env?.SUPABASE_AUTH_URL;
  const publishableKey = env?.SUPABASE_PUBLISHABLE_KEY;
  const attestationKey = env?.APPROVAL_ATTESTATION_KEY;
  const hyperdrive = env?.APPROVAL_HYPERDRIVE;
  if (
    !safeLocalAuth(authUrl) ||
    typeof publishableKey !== "string" ||
    !publishableKey.trim() ||
    typeof attestationKey !== "string" ||
    !/^[0-9a-f]{64}$/i.test(attestationKey) ||
    !hyperdrive ||
    typeof hyperdrive.connectionString !== "string" ||
    !hyperdrive.connectionString.trim()
  ) {
    return null;
  }
  try {
    const parsed = new URL(hyperdrive.connectionString);
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      parsed.username !== "alp_approval_worker_login" ||
      !parsed.password ||
      !parsed.hostname ||
      !parsed.pathname ||
      parsed.pathname === "/"
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return { authUrl, publishableKey, attestationKey, connectionString: hyperdrive.connectionString };
}
const errorResponse = () =>
  new Response(JSON.stringify({ error: "approval_service_unconfigured" }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default {
  async fetch(request, env) {
    const config = credentials(env);
    if (!config) return errorResponse();
    try {
      // Load the Node PostgreSQL driver only after GoTrue has validated a bearer
      // and the restricted transaction port is actually invoked. An unauthenticated
      // request must not initialize database machinery at Worker startup.
      const db = {
        async withTransaction(action) {
          const { createRestrictedApprovalDatabase } =
            await import("./worker-approval-postgres.mjs");
          return createRestrictedApprovalDatabase({
            connectionString: config.connectionString,
          }).withTransaction(action);
        },
      };
      const checkSession = createApprovalSessionBroker({ db });
      return await createWorkerApprovalHandler({
        authUrl: config.authUrl,
        publishableKey: config.publishableKey,
        attestationKey: config.attestationKey,
        checkSession,
        db,
      }).fetch(request);
    } catch {
      // No diagnostic details / credentials in a publicly reachable response.
      return new Response(JSON.stringify({ error: "approval_unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
  },
};
