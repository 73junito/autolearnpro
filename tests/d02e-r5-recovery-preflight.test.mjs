import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRecoveryPreflight,
  recoveryScope,
  collectRecoveryPreflight,
} from "../infrastructure/scripts/r5-recovery-preflight.mjs";

const versions = Array.from({ length: 27 }, (_, i) => String(20260000000000 + i));
const baseline = () => ({
  migrations: { count: 27, versions: [...versions], sha256: "a".repeat(64) },
  schemas: ["alp_private", "auth", "extensions", "realtime", "storage"].map((schema) => ({
    schema,
    owner: "postgres",
  })),
  roles: [
    "alp_academic_executor",
    "alp_academic_worker_login",
    "alp_approval_executor",
    "alp_approval_worker_login",
  ].map((rolname) => ({
    rolname,
    rolcanlogin: rolname.endsWith("_worker_login"),
    rolsuper: false,
    rolbypassrls: false,
    rolinherit: false,
  })),
  memberships: [
    ["alp_academic_worker_login", "alp_academic_executor"],
    ["alp_approval_worker_login", "alp_approval_executor"],
  ].map(([member, parent]) => ({
    member,
    parent,
    inherit_option: false,
    set_option: true,
    admin_option: false,
  })),
  securityDefiners: [
    {
      signature: "alp_private.verify_approval_attestation(text,uuid,text[],bigint,uuid,text)",
      owner: "service_role",
    },
  ],
  extensions: [{ name: "pgcrypto", version: "1.3", schema: "extensions" }],
  grants: {
    executor_key_read: false,
    executor_auth_read: false,
    executor_rotate: false,
    anon_emergency: false,
    executor_session_lock: true,
  },
});

test("R5 accepted inventory is NOT a full restore certification", () => {
  const scope = recoveryScope(baseline());
  assert.equal(scope.status, "INVENTORY_VERIFIED");
  assert.equal(scope.independentlyRestored, false);
  assert.equal(scope.fullSupabaseRestoreVerified, false);
  assert.ok(scope.requiredNextGates.length >= 4);
});
test("R5 rejects missing manifests and missing migration receipts", () => {
  assert.ok(evaluateRecoveryPreflight(null).length > 0);
  const x = baseline();
  x.migrations.count = 26;
  assert.match(evaluateRecoveryPreflight(x).join(" "), /migration provenance/);
});
test("R5 rejects privilege widening and SECURITY DEFINER owner substitution", () => {
  const x = baseline();
  x.grants.executor_key_read = true;
  x.securityDefiners[0].owner = "authenticated";
  const failures = evaluateRecoveryPreflight(x).join(" ");
  assert.match(failures, /privilege boundary/);
  assert.match(failures, /verifier owner/);
  assert.match(failures, /unexpected private/);
});
test("R5 rejects privileged login and expanded membership inheritance", () => {
  const x = baseline();
  x.roles.find((r) => r.rolname === "alp_approval_worker_login").rolsuper = true;
  x.memberships.find((m) => m.member === "alp_approval_worker_login").inherit_option = true;
  const failures = evaluateRecoveryPreflight(x).join(" ");
  assert.match(failures, /invalid restricted role/);
  assert.match(failures, /membership missing/);
});
test("R5 rejects missing Supabase-managed schema and pgcrypto", () => {
  const x = baseline();
  x.schemas = x.schemas.filter((s) => s.schema !== "auth");
  x.extensions = [];
  const failures = evaluateRecoveryPreflight(x).join(" ");
  assert.match(failures, /missing schema inventory/);
  assert.match(failures, /pgcrypto/);
});
test("R5 collector performs only fixed metadata queries and returns no key material", async () => {
  const calls = [];
  const rows = [
    versions.map((version) => ({ version, statements: "{}" })),
    baseline().schemas,
    baseline().roles,
    baseline().memberships,
    baseline().securityDefiners,
    baseline().extensions,
    [baseline().grants],
  ];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return { rows: rows[calls.length - 1], rowCount: rows[calls.length - 1].length };
    },
  };
  const result = await collectRecoveryPreflight(client);
  assert.equal(result.migrations.count, 27);
  assert.match(result.migrations.sha256, /^[a-f0-9]{64}$/);
  assert.equal(calls.length, 7);
  assert.ok(calls.every((c) => /^\s*SELECT/.test(c.sql)));
  assert.ok(calls.every((c) => !/key_bytes|rolpassword|SELECT \*/i.test(c.sql)));
  assert.equal(evaluateRecoveryPreflight(result).length, 0);
});
