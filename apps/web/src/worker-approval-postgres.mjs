import pg from "pg";

// D02-E-R2 restricted PostgreSQL transaction provider for Cloudflare Workers.
// Requires nodejs_compat, pg 8.16.3, and a separate, authenticated
// alp_approval_worker_login endpoint (e.g., approved Hyperdrive binding).
// Never uses a database-owner connection or accepts a caller-provided role.
const EXPECTED_LOGIN = "alp_approval_worker_login";
const EXPECTED_ROLE = "alp_approval_executor";

export function createRestrictedApprovalDatabase({
  connectionString,
  clientFactory = (configuration) => new pg.Client(configuration),
} = {}) {
  if (
    typeof connectionString !== "string" ||
    !connectionString.trim() ||
    typeof clientFactory !== "function"
  ) {
    throw new Error("restricted approval database is unconfigured");
  }

  return {
    async withTransaction(action) {
      if (typeof action !== "function") throw new TypeError("transaction action required");
      // One fresh client per transaction: never share transaction / role state.
      const client = clientFactory({
        connectionString,
        connectionTimeoutMillis: 5000,
        query_timeout: 10000,
        statement_timeout: 10000,
        application_name: "alp_approval_worker",
      });
      if (
        !client ||
        typeof client.query !== "function" ||
        typeof client.connect !== "function" ||
        typeof client.end !== "function"
      ) {
        throw new Error("invalid approval database client");
      }
      let begun = false;
      let finalized = false;
      let problem;
      let result;
      try {
        await client.connect();
        await client.query("BEGIN");
        begun = true;
        // Static role string; never interpolate request input as an identifier.
        await client.query("SET LOCAL ROLE alp_approval_executor");
        const identity = await client.query(
          "SELECT session_user AS login_role, current_user AS executor_role",
        );
        if (
          identity.rowCount !== 1 ||
          identity.rows[0]?.login_role !== EXPECTED_LOGIN ||
          identity.rows[0]?.executor_role !== EXPECTED_ROLE
        ) {
          throw new Error("restricted approval database identity mismatch");
        }

        let active = true;
        const tx = Object.freeze({
          query: (statement, params) => {
            if (!active) throw new Error("approval transaction no longer active");
            if (typeof statement !== "string" || !Array.isArray(params)) {
              throw new TypeError("parameterized SQL query required");
            }
            return client.query(statement, params);
          },
        });
        try {
          result = await action(tx);
        } finally {
          active = false;
        }
        await client.query("COMMIT");
        finalized = true;
      } catch (error) {
        problem = error;
        if (begun && !finalized) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve original failure; the connection is always discarded.
          }
        }
      } finally {
        // Always discard this client: no role or transaction state leakage.
        try {
          await client.end();
        } catch (error) {
          if (!problem) problem = error;
        }
      }
      if (problem) throw problem;
      return result;
    },
  };
}
