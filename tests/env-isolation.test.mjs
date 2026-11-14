import test from "node:test";
import assert from "node:assert/strict";
import { createRoleApproval } from "../apps/web/src/role-approval.mjs";
import { createAcademic } from "../apps/web/src/academic.mjs";

// Gap G1 regression: unit tests must not change behaviour because the ambient
// shell happens to export ALP_* variables. Configuration passed explicitly must
// always win, and an injected pool must never be opened from ambient values.

const KEYS = ["ALP_SUPABASE_URL", "ALP_SUPABASE_PUBLISHABLE_KEY", "ALP_DATABASE_URL", "ALP_LOCAL_INTEGRATION"];

function withAmbientEnv(fn) {
  const saved = new Map(KEYS.map((k) => [k, process.env[k]]));
  process.env.ALP_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.ALP_SUPABASE_PUBLISHABLE_KEY = "ambient-key";
  process.env.ALP_DATABASE_URL = "postgresql://ambient:ambient@127.0.0.1:1/postgres";
  process.env.ALP_LOCAL_INTEGRATION = "1";
  try {
    return fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("env isolation: explicit nulls keep the approval service disabled despite ambient ALP_*", () => {
  withAmbientEnv(() => {
    const disabled = createRoleApproval({ authUrl: null, publishableKey: null, databaseUrl: null });
    assert.equal(disabled.enabled, false, "explicit nulls must override ambient configuration");
  });
});

test("env isolation: explicit configuration enables the approval service despite absent ambient values", () => {
  const saved = new Map(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  try {
    const configured = createRoleApproval({
      authUrl: "http://127.0.0.1:1",
      publishableKey: "explicit-key",
      pool: { connect: async () => { throw new Error("must not connect"); }, end: async () => {} }
    });
    assert.equal(configured.enabled, true);
  } finally {
    for (const [k, v] of saved) {
      if (v !== undefined) process.env[k] = v;
    }
  }
});

test("env isolation: injected pool is not opened from ambient values", () => {
  withAmbientEnv(() => {
    let connects = 0;
    const pool = {
      connect: async () => { connects++; throw new Error("must not connect during construction"); },
      end: async () => {}
    };
    const academic = createAcademic({
      authUrl: "http://127.0.0.1:1",
      publishableKey: "explicit-key",
      pool,
      fetchImpl: async () => ({ ok: false })
    });
    assert.equal(connects, 0, "constructing the service must not acquire a connection");
    assert.equal(typeof academic.process, "function");
    academic.close();
  });
});
