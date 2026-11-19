// R3B: restricted boolean query; does not grant direct auth.sessions access.
// db is the R2 provider, which verifies the database login and static executor role.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SQL = "SELECT alp_private.approval_session_active($1::uuid,$2::uuid) AS active";

export function createApprovalSessionBroker({ db } = {}) {
  if (!db || typeof db.withTransaction !== "function") {
    throw new Error("trusted session broker requires restricted database transactions");
  }
  return async function checkSession({ actor, sessionId } = {}) {
    if (
      typeof actor !== "string" ||
      !UUID.test(actor) ||
      typeof sessionId !== "string" ||
      !UUID.test(sessionId)
    ) {
      return false;
    }
    // Never cache session state: logout/revocation must take effect on the
    // subsequent call, including the post-quota pre-mutation check.
    const result = await db.withTransaction((tx) => tx.query(SQL, [actor, sessionId]));
    if (!result || result.rows?.length !== 1 || typeof result.rows[0]?.active !== "boolean") {
      throw new Error("trusted session lookup returned an invalid response");
    }
    return result.rows[0].active;
  };
}
