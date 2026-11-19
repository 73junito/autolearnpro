import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateReleaseHold,
  inspectReleaseHold,
  REQUIRED_BINDINGS,
} from "../infrastructure/scripts/check-r8-release-hold.mjs";
const root = process.cwd();
const original = JSON.parse(
  readFileSync("infrastructure/cloudflare/r8-release-readiness.json", "utf8"),
);
const workerSource = readFileSync("apps/web/src/worker-approval-entrypoint.mjs", "utf8");
const base = {
  workerSource,
  workflows: "on:\n  pull_request:\npermissions:\n  contents: read\n",
  rootEntries: [],
  packageJson: readFileSync("package.json", "utf8"),
  docsExist: true,
};
const copy = () => structuredClone(original);
test("R8 current repository remains source-only HOLD, not deployment-ready", () => {
  const check = inspectReleaseHold(root);
  assert.equal(check.status, "SOURCE_ONLY_HOLD_VERIFIED", check.findings.join("; "));
  assert.equal(check.deployAllowed, false);
  assert.equal(check.hostedVerification, false);
  assert.equal(check.remainingGates, 9);
  assert.match(check.checkedSourceSha256, /^[a-f0-9]{64}$/);
});
test("R8 policy baseline has exactly four kinds of Worker bindings", () => {
  const p = copy();
  assert.deepEqual(
    p.bindings.map((x) => [x.name, x.kind]),
    Object.entries(REQUIRED_BINDINGS),
  );
  assert.deepEqual(evaluateReleaseHold(p, base), []);
});
test("R8 rejects attempted GO or fabricated hosted release signoff", () => {
  for (const edit of [
    (p) => {
      p.deploymentAllowed = true;
    },
    (p) => {
      p.state = "READY";
    },
    (p) => {
      p.runtime.hostedRuntimeValidated = true;
    },
    (p) => {
      p.requiredEvidence[0].verified = true;
    },
    (p) => {
      p.requiredEvidence.pop();
    },
  ]) {
    const p = copy();
    edit(p);
    assert.ok(evaluateReleaseHold(p, base).length > 0);
  }
});
test("R8 rejects overprivileged binding, missing secret and drifted Worker code", () => {
  const p = copy();
  p.bindings.find((x) => x.name === "APPROVAL_HYPERDRIVE").kind = "runtime-config";
  assert.match(evaluateReleaseHold(p, base).join(" "), /binding/);
  const noKey = copy();
  noKey.bindings = noKey.bindings.filter((x) => x.name !== "APPROVAL_ATTESTATION_KEY");
  assert.match(evaluateReleaseHold(noKey, base).join(" "), /binding/);
  assert.match(
    evaluateReleaseHold(copy(), {
      ...base,
      workerSource: workerSource.replace("env?.APPROVAL_HYPERDRIVE", "env?.BAD_HYPERDRIVE"),
    }).join(" "),
    /binding mismatch/,
  );
});
test("R8 refuses stored database URLs, private keys and auth tokens", () => {
  for (const secret of [
    "postgresql://admin:password@db.example.com:5432/postgres",
    "-----BEGIN PRIVATE KEY-----",
    "sk_live_0123456789ABCDEF",
  ]) {
    const p = copy();
    p.notes = secret;
    assert.match(evaluateReleaseHold(p, base).join(" "), /credential or token/);
  }
});
test("R8 rejects deploy scripts, deployment configuration and workflow secret provisioning", () => {
  for (const workflow of [
    "on:\n  pull_request:\npermissions:\n  contents: read\nrun: cf deploy",
    "on:\n  pull_request:\npermissions:\n  contents: read\nuses: cloudflare/wrangler-action@v3",
    "on:\n  pull_request:\npermissions:\n  contents: read\nrun: cf workers secrets bulk",
  ])
    assert.match(
      evaluateReleaseHold(copy(), { ...base, workflows: workflow }).join(" "),
      /deployment/,
    );
  assert.match(
    evaluateReleaseHold(copy(), { ...base, rootEntries: ["wrangler.jsonc"] }).join(" "),
    /deployment config/,
  );
  assert.match(
    evaluateReleaseHold(copy(), {
      ...base,
      packageJson: '{"scripts":{"deploy":"cf deploy"}}',
    }).join(" "),
    /deployment-capable/,
  );
});
test("R8 requires human decision packet and locked-down CI permissions", () => {
  assert.match(
    evaluateReleaseHold(copy(), { ...base, docsExist: false }).join(" "),
    /documentation/,
  );
  assert.match(
    evaluateReleaseHold(copy(), {
      ...base,
      workflows: "on:\n  pull_request:\npermissions:\n  contents: write\n",
    }).join(" "),
    /read-only/,
  );
});
