// R5: read-only, secret-free recovery preflight on disposable Supabase.
// This is an inventory / fail-closed readiness gate, NOT a full restore.
import { createHash } from "node:crypto";

const EXPECTED_ROLES = [
  "alp_academic_executor",
  "alp_academic_worker_login",
  "alp_approval_executor",
  "alp_approval_worker_login",
];
const MANAGED_SCHEMAS = ["alp_private", "auth", "extensions", "realtime", "storage"];

export async function collectRecoveryPreflight(client) {
  if (!client || typeof client.query !== "function") {
    throw new TypeError("trusted PostgreSQL read-only client required");
  }
  // Nothing here selects credentials, role password hashes, JWTs, user rows,
  // or key material. All SQL is fixed; no caller-supplied identifiers.
  const [migrations, schemas, roles, memberships, securityDefiners, extensions, grants] =
    await Promise.all([
      client.query(
        "SELECT version, statements::text AS statements FROM supabase_migrations.schema_migrations ORDER BY version",
      ),
      client.query(
        `
        SELECT n.nspname AS schema, r.rolname AS owner
        FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
        WHERE n.nspname=ANY($1::text[]) ORDER BY n.nspname
      `,
        [MANAGED_SCHEMAS],
      ),
      client.query(
        `
        SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolinherit
        FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname
      `,
        [EXPECTED_ROLES],
      ),
      client.query(`
        SELECT member.rolname AS member, parent.rolname AS parent,
               m.inherit_option, m.set_option, m.admin_option
        FROM pg_auth_members m
        JOIN pg_roles member ON member.oid=m.member
        JOIN pg_roles parent ON parent.oid=m.roleid
        WHERE member.rolname IN ('alp_academic_worker_login','alp_approval_worker_login')
        ORDER BY member.rolname,parent.rolname
      `),
      client.query(`
        SELECT p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS owner
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='alp_private' AND p.prosecdef
        ORDER BY signature
      `),
      client.query(`
        SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema
        FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
        ORDER BY e.extname
      `),
      client.query(`
        SELECT
          has_table_privilege('alp_approval_executor',
            'alp_private.alp_approval_attestation_keys','SELECT') AS executor_key_read,
          has_table_privilege('alp_approval_executor','auth.sessions','SELECT') AS executor_auth_read,
          has_function_privilege('alp_approval_executor',
            'alp_private.rotate_approval_attestation_key(integer,bytea,integer)','EXECUTE') AS executor_rotate,
          has_function_privilege('anon',
            'alp_private.emergency_revoke_approval_attestations()','EXECUTE') AS anon_emergency,
          has_function_privilege('alp_approval_executor',
            'alp_private.lock_approval_actor_session(uuid,uuid)','EXECUTE') AS executor_session_lock
      `),
    ]);
  return {
    migrations: {
      count: migrations.rowCount,
      versions: migrations.rows.map((x) => x.version),
      sha256: createHash("sha256").update(JSON.stringify(migrations.rows)).digest("hex"),
    },
    schemas: schemas.rows,
    roles: roles.rows,
    memberships: memberships.rows,
    securityDefiners: securityDefiners.rows,
    extensions: extensions.rows,
    grants: grants.rows[0],
  };
}

export function evaluateRecoveryPreflight(manifest) {
  if (!manifest || typeof manifest !== "object") return ["missing recovery inventory"];
  const findings = [];
  if (
    manifest.migrations?.count !== 27 ||
    manifest.migrations.versions?.length !== 27 ||
    !/^[0-9a-f]{64}$/.test(manifest.migrations.sha256 || "") ||
    new Set(manifest.migrations.versions).size !== 27
  ) {
    findings.push("unexpected migration provenance");
  }
  const roles = new Map((manifest.roles || []).map((r) => [r.rolname, r]));
  for (const name of EXPECTED_ROLES) {
    const role = roles.get(name);
    if (
      !role ||
      role.rolsuper !== false ||
      role.rolbypassrls !== false ||
      role.rolcanlogin !== name.endsWith("_worker_login")
    ) {
      findings.push(`invalid restricted role: ${name}`);
    }
  }
  const memberships = new Map(
    (manifest.memberships || []).map((m) => [m.member + ":" + m.parent, m]),
  );
  for (const [login, executor] of [
    ["alp_academic_worker_login", "alp_academic_executor"],
    ["alp_approval_worker_login", "alp_approval_executor"],
  ]) {
    const m = memberships.get(login + ":" + executor);
    if (!m || m.inherit_option !== false || m.set_option !== true || m.admin_option !== false) {
      findings.push(`restricted role membership missing: ${login}`);
    }
  }
  const schemas = new Map((manifest.schemas || []).map((s) => [s.schema, s.owner]));
  for (const name of MANAGED_SCHEMAS) {
    if (!schemas.get(name)) findings.push(`missing schema inventory: ${name}`);
  }
  const definers = manifest.securityDefiners || [];
  if (
    !definers.length ||
    !definers.some(
      (x) =>
        x.signature?.startsWith("alp_private.verify_approval_attestation(") &&
        x.owner === "service_role",
    )
  ) {
    findings.push("attestation verifier owner invalid");
  }
  if (definers.some((x) => !["postgres", "service_role"].includes(x.owner))) {
    findings.push("unexpected private SECURITY DEFINER function owner");
  }
  if (!(manifest.extensions || []).some((e) => e.name === "pgcrypto")) {
    findings.push("missing pgcrypto extension inventory");
  }
  const g = manifest.grants;
  if (
    !g ||
    g.executor_key_read !== false ||
    g.executor_auth_read !== false ||
    g.executor_rotate !== false ||
    g.anon_emergency !== false ||
    g.executor_session_lock !== true
  ) {
    findings.push("approval privilege boundary not preserved");
  }
  return findings;
}

export function recoveryScope(manifest) {
  const findings = evaluateRecoveryPreflight(manifest);
  return {
    status: findings.length ? "BLOCKED" : "INVENTORY_VERIFIED",
    findings,
    // Never conflate an inventory with a tested full independent restore.
    independentlyRestored: false,
    fullSupabaseRestoreVerified: false,
    requiredNextGates: [
      "separately provisioned cluster and all global roles",
      "supported Supabase Auth/Realtime/Storage restore and schema ownership",
      "extension/version compatibility and SECURITY DEFINER ownership checks",
      "encrypted external archive and point-in-time restore",
      "real GoTrue revocation and Cloudflare workerd integration",
    ],
  };
}
