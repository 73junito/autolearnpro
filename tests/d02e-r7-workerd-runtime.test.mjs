import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

const DIR = mkdtempSync(path.join(process.cwd(), ".r7-workerd-"));
const ENTRY = path.join(process.cwd(), "apps/web/src/worker-approval-entrypoint.mjs");
const OUTPUT = path.join(DIR, "worker.mjs");
const FLAGS = { compatibilityDate: "2026-08-06", compatibilityFlags: ["nodejs_compat"] };

test(
  "R7 entrypoint executes in local Cloudflare workerd, denies missing credentials",
  {
    timeout: 60000,
  },
  async () => {
    await build({
      entryPoints: [ENTRY],
      outfile: OUTPUT,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "es2022",
      packages: "bundle",
      logLevel: "silent",
      external: ["node:*"],
      conditions: ["workerd", "worker", "browser", "import"],
    });
    const runtime = new Miniflare({
      ...FLAGS,
      scriptPath: OUTPUT,
      modules: true,
    });
    try {
      const response = await runtime.dispatchFetch("http://r7.invalid/api/roles/request", {
        method: "POST",
        headers: { authorization: "Bearer synthetic", "content-type": "application/json" },
        body: JSON.stringify({ targetId: "invalid", role: "instructor", reason: "synthetic" }),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "approval_service_unconfigured" });
      assert.equal(response.headers.get("cache-control"), "no-store");
    } finally {
      await runtime.dispose();
    }
  },
);

test(
  "R7 workerd refuses missing or malformed Hyperdrive and signing bindings",
  {
    timeout: 60000,
  },
  async () => {
    const runtime = new Miniflare({
      ...FLAGS,
      scriptPath: OUTPUT,
      modules: true,
      bindings: {
        SUPABASE_AUTH_URL: "https://auth.invalid",
        SUPABASE_PUBLISHABLE_KEY: "synthetic",
        APPROVAL_ATTESTATION_KEY: "wrong-secret",
      },
      hyperdrives: { APPROVAL_HYPERDRIVE: "postgresql://postgres:synthetic@127.0.0.1:9/postgres" },
    });
    try {
      const denied = await runtime.dispatchFetch("http://r7.invalid/api/roles/request", {
        method: "POST",
        headers: { authorization: "Bearer synthetic" },
      });
      assert.equal(denied.status, 503);
      assert.deepEqual(await denied.json(), { error: "approval_service_unconfigured" });
    } finally {
      await runtime.dispose();
    }
  },
);

test(
  "R7 valid-but-disconnected Hyperdrive configuration cannot bypass bearer gate",
  {
    timeout: 60000,
  },
  async () => {
    const runtime = new Miniflare({
      ...FLAGS,
      scriptPath: OUTPUT,
      modules: true,
      bindings: {
        SUPABASE_AUTH_URL: "https://auth.invalid",
        SUPABASE_PUBLISHABLE_KEY: "synthetic",
        APPROVAL_ATTESTATION_KEY: "a".repeat(64),
      },
      hyperdrives: {
        APPROVAL_HYPERDRIVE:
          "postgresql://alp_approval_worker_login:synthetic@127.0.0.1:9/postgres",
      },
    });
    try {
      const denied = await runtime.dispatchFetch("http://r7.invalid/api/roles/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetId: "invalid", role: "instructor", reason: "synthetic" }),
      });
      assert.equal(denied.status, 401);
      assert.deepEqual(await denied.json(), { error: "unauthorized" });
      assert.equal(denied.headers.get("cache-control"), "no-store");
    } finally {
      await runtime.dispose();
    }
  },
);
test.after(() => rmSync(DIR, { recursive: true, force: true }));

test(
  "R7 workerd refuses database-owner Hyperdrive credentials even with a valid signer",
  {
    timeout: 60000,
  },
  async () => {
    const runtime = new Miniflare({
      ...FLAGS,
      scriptPath: OUTPUT,
      modules: true,
      bindings: {
        SUPABASE_AUTH_URL: "https://auth.invalid",
        SUPABASE_PUBLISHABLE_KEY: "synthetic",
        APPROVAL_ATTESTATION_KEY: "b".repeat(64),
      },
      hyperdrives: {
        APPROVAL_HYPERDRIVE: "postgresql://postgres:synthetic@127.0.0.1:9/postgres",
      },
    });
    try {
      const rejected = await runtime.dispatchFetch("http://r7.invalid/api/roles/request", {
        method: "POST",
        headers: { authorization: "Bearer synthetic", "content-type": "application/json" },
        body: JSON.stringify({ targetId: "invalid", role: "instructor", reason: "synthetic" }),
      });
      assert.equal(rejected.status, 503);
      assert.deepEqual(await rejected.json(), { error: "approval_service_unconfigured" });
    } finally {
      await runtime.dispose();
    }
  },
);
