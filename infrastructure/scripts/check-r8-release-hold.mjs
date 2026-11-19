// D02-E-R8: source-only release-readiness evidence; never deploys or reads credentials.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_BINDINGS = Object.freeze({
  SUPABASE_AUTH_URL: "runtime-config",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  APPROVAL_ATTESTATION_KEY: "worker-secret",
  APPROVAL_HYPERDRIVE: "hyperdrive",
});
export const REQUIRED_GATES = Object.freeze([
  "cloudflare_account_scoping",
  "hosted_hyperdrive_tls",
  "restricted_login_provisioning",
  "worker_secret_provisioning",
  "hosted_gotrue_integration",
  "observability",
  "rollback_rehearsal",
  "managed_supabase_recovery",
  "explicit_security_go",
]);

export function evaluateReleaseHold(
  policy,
  { workerSource, workflows, rootEntries, packageJson, docsExist } = {},
) {
  const violations = [];
  if (!policy || typeof policy !== "object") return ["release policy missing"];
  if (
    policy.schemaVersion !== 1 ||
    policy.review !== "ALP-D02-E-R8" ||
    policy.state !== "SOURCE_ONLY_HOLD" ||
    policy.deploymentAllowed !== false
  )
    violations.push("release authority must remain SOURCE_ONLY_HOLD");
  if (
    policy.cloudflareCli !== "cf" ||
    policy.sourceEntrypoint !== "apps/web/src/worker-approval-entrypoint.mjs"
  )
    violations.push("unexpected Cloudflare deployment tooling or entrypoint");
  const runtime = policy.runtime || {};
  if (
    runtime.compatibilityDateValidated !== "2026-08-06" ||
    runtime.hostedRuntimeValidated !== false ||
    JSON.stringify(runtime.compatibilityFlags) !== '["nodejs_compat"]'
  )
    violations.push("runtime evidence misrepresented or changed");
  const names = new Set();
  if (!Array.isArray(policy.bindings) || policy.bindings.length !== 4)
    violations.push("unexpected required Worker binding count");
  for (const binding of policy.bindings || []) {
    if (
      !binding ||
      names.has(binding.name) ||
      REQUIRED_BINDINGS[binding.name] !== binding.kind ||
      binding.verified !== false ||
      typeof binding.requirement !== "string" ||
      binding.requirement.length < 15
    )
      violations.push("missing, incorrect or purportedly verified Worker binding");
    if (binding?.name) names.add(binding.name);
  }
  for (const name of Object.keys(REQUIRED_BINDINGS)) {
    if (!names.has(name)) violations.push("missing binding: " + name);
    if (typeof workerSource !== "string" || !workerSource.includes("env?." + name))
      violations.push("Worker entrypoint binding mismatch: " + name);
  }
  if (
    typeof workerSource !== "string" ||
    !workerSource.includes('parsed.username !== "alp_approval_worker_login"') ||
    !workerSource.includes("createApprovalSessionBroker") ||
    !workerSource.includes("createWorkerApprovalHandler")
  )
    violations.push("restricted Worker authorization boundary missing");
  const gates = new Set();
  if (
    !Array.isArray(policy.requiredEvidence) ||
    policy.requiredEvidence.length !== REQUIRED_GATES.length
  )
    violations.push("required external release evidence incomplete");
  for (const evidence of policy.requiredEvidence || []) {
    if (
      !evidence ||
      gates.has(evidence.id) ||
      !REQUIRED_GATES.includes(evidence.id) ||
      evidence.verified !== false ||
      typeof evidence.description !== "string" ||
      evidence.description.length < 20
    )
      violations.push("unexpected or falsely verified external release evidence");
    if (evidence?.id) gates.add(evidence.id);
  }
  for (const name of REQUIRED_GATES)
    if (!gates.has(name)) violations.push("missing release gate: " + name);
  const receipts = policy.sourceOnlyEvidence;
  if (
    !receipts ||
    !/^https:\/\/github\.com\/73junito\/autolearnpro\/actions\/runs\/\d+$/.test(
      receipts.r7bCiRun || "",
    ) ||
    !/^https:\/\/github\.com\/73junito\/autolearnpro\/actions\/runs\/\d+$/.test(
      receipts.r7cCiRun || "",
    ) ||
    !/disposable Supabase/.test(receipts.scope || "")
  )
    violations.push("local-only R7 receipts missing or incorrectly scoped");
  const serialized = JSON.stringify(policy);
  if (
    /postgres(?:ql)?:\/\/[^\s"']+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk_(?:live|test)_[a-zA-Z0-9]+|\beyJ[A-Za-z0-9_-]{30,}\./.test(
      serialized,
    )
  )
    violations.push("potential credential or token embedded in release policy");
  if (
    !Array.isArray(policy.disallowedInRepo) ||
    JSON.stringify(policy.disallowedInRepo) !==
      JSON.stringify(["wrangler.toml", "wrangler.json", "wrangler.jsonc", "cloudflare.config.ts"])
  )
    violations.push("unauthorized deployment-config restriction modified");
  const filenames = Array.isArray(rootEntries) ? rootEntries : [];
  for (const name of policy.disallowedInRepo || [])
    if (filenames.includes(name)) violations.push("unexpected root deployment config: " + name);
  if (
    typeof workflows !== "string" ||
    /\b(?:cf|wrangler|npx\s+wrangler)\s+(?:deploy|publish|(?:workers\s+)?secret(?:s)?\s+(?:put|bulk))\b|cloudflare\/wrangler-action|cloudflare\/deploy/i.test(
      workflows,
    )
  )
    violations.push("deployment or secret provisioning action in repository CI");
  if (!/pull_request:/m.test(workflows) || !/contents:\s*read/m.test(workflows))
    violations.push("CI read-only repository guard missing");
  if (
    typeof packageJson !== "string" ||
    /"(?:deploy|publish|release)(?::[^"]*)?"\s*:/.test(packageJson)
  )
    violations.push("deployment-capable package script introduced");
  if (docsExist !== true) violations.push("R8 human release decision documentation missing");
  return [...new Set(violations)];
}

export function inspectReleaseHold(root) {
  const policy = JSON.parse(
    readFileSync(path.join(root, "infrastructure/cloudflare/r8-release-readiness.json"), "utf8"),
  );
  const workerSource = readFileSync(path.join(root, policy.sourceEntrypoint), "utf8");
  const workflows = readdirSync(path.join(root, ".github/workflows"))
    .filter((n) => /\.ya?ml$/.test(n))
    .map((n) => readFileSync(path.join(root, ".github/workflows", n), "utf8"))
    .join("\n");
  const rootEntries = readdirSync(root);
  const packageJson = readFileSync(path.join(root, "package.json"), "utf8");
  const docsExist = existsSync(path.join(root, "docs/security/ALP-D02-E-R8-release-readiness.md"));
  const findings = evaluateReleaseHold(policy, {
    workerSource,
    workflows,
    rootEntries,
    packageJson,
    docsExist,
  });
  return {
    status: findings.length ? "BLOCKED" : "SOURCE_ONLY_HOLD_VERIFIED",
    findings,
    deployAllowed: false,
    checkedSourceSha256: createHash("sha256").update(workerSource).digest("hex"),
    hostedVerification: false,
    remainingGates: REQUIRED_GATES.length,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const state = inspectReleaseHold(root);
  if (state.findings.length) {
    console.error("R8 FAIL: " + state.findings.join("; "));
    process.exitCode = 1;
  } else {
    console.log(
      "R8 PASS: source-only release HOLD enforced; source SHA-256 " + state.checkedSourceSha256,
    );
    console.log(
      "R8 HOLD: " +
        state.remainingGates +
        " external gates NOT verified; Cloudflare deploy and hosted Supabase changes prohibited",
    );
  }
}
