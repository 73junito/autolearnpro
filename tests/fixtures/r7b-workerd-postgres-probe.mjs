// TEST-ONLY: never import from the public Worker entrypoint.
import { createRestrictedApprovalDatabase } from "../../apps/web/src/worker-approval-postgres.mjs";
import { createApprovalSessionBroker } from "../../apps/web/src/worker-approval-session-broker.mjs";
import { signWorkerApproval } from "../../apps/web/src/approval-attestation-worker.mjs";
export default {
  async fetch(request, env) {
    if (
      env.R7B_TEST_ONLY !== "disposable-local-gate" ||
      !env.APPROVAL_HYPERDRIVE?.connectionString ||
      !env.TEST_ACTOR ||
      !env.TEST_SESSION ||
      !env.TEST_SIGNING_KEY
    )
      return new Response("disabled", { status: 503 });
    const { operation } = await request.json();
    const db = createRestrictedApprovalDatabase({
      connectionString: env.APPROVAL_HYPERDRIVE.connectionString,
    });
    if (operation === "session") {
      const active = await createApprovalSessionBroker({ db })({
        actor: env.TEST_ACTOR,
        sessionId: env.TEST_SESSION,
      });
      return Response.json({ active });
    }
    if (operation === "identity") {
      const result = await db.withTransaction((tx) =>
        tx.query("SELECT session_user AS login,current_user AS executor", []),
      );
      return Response.json(result.rows[0]);
    }
    if (operation === "forbidden") {
      try {
        await db.withTransaction((tx) => tx.query("SELECT id FROM auth.sessions LIMIT 1", []));
      } catch (e) {
        if (e?.code === "42501") return Response.json({ denied: true });
        throw e;
      }
      return Response.json({ denied: false });
    }
    if (operation === "commit" || operation === "rollback") {
      const proof = await signWorkerApproval(env.TEST_SIGNING_KEY, "quota", env.TEST_ACTOR, []);
      try {
        const rows = await db.withTransaction(async (tx) => {
          const row = await tx.query(
            "SELECT alp_private.consume_approval_quota_signed($1,$2,$3,$4) AS allowed",
            [env.TEST_ACTOR, ...proof],
          );
          if (operation === "rollback") throw Error("R7B forced rollback");
          return row;
        });
        return Response.json({ allowed: rows.rows[0]?.allowed });
      } catch (e) {
        if (operation === "rollback" && e.message === "R7B forced rollback")
          return Response.json({ rolledBack: true });
        throw e;
      }
    }
    return new Response("unknown operation", { status: 404 });
  },
};
