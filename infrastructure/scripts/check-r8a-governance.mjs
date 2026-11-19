// R8A: governance evidence must honestly state the observed release HOLD.
// Repository-settings changes require a separate human decision and live reinspection.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIREMENTS = Object.freeze([
  "enable-enforced-main-protection",
  "require-independent-approving-review",
  "require-status-checks-for-all-three-jobs",
  "forbid-force-push-and-deletion",
  "ensure-admin-bypass-policy-reviewed",
  "restrict-actions-and-pin-trusted-actions",
  "create-protected-staging-and-production-environments",
  "authorize-credential-and-secret-provisioning",
  "perform-hosted-TLS-and-recovery-validation",
  "record-separate-production-go",
]);
const REQUIRED_CI_JOBS = ["foundation-and-academic:", "r7-workerd-runtime:", "r1-live-database:"];
export function verifyR8aGovernance(record, { workflowText, releasePolicy, docsPresent } = {}) {
  const errors = [];
  if (!record || typeof record !== "object") return ["R8A governance observation missing"];
  if (
    record.schemaVersion !== 1 ||
    record.review !== "ALP-D02-E-R8A" ||
    record.status !== "GOVERNANCE_HOLD" ||
    record.releaseAllowed !== false ||
    record.repository !== "73junito/autolearnpro" ||
    record.branch !== "main"
  )
    errors.push("R8A must remain GOVERNANCE_HOLD");
  if (
    !/^2026-\d{2}-\d{2}$/.test(record.observedAtUtc || "") ||
    !/^[a-f0-9]{40}$/.test(record.observedMainSha || "")
  )
    errors.push("auditable observation date and commit missing");
  const o = record.observations || {},
    r = o.repositoryRuleset || {},
    a = o.actions || {},
    e = o.environments || {};
  if (
    o.mainProtected !== false ||
    o.classicBranchProtection !== "absent" ||
    r.id !== 26665434 ||
    r.name !== "protect-main-foundation" ||
    r.enforcement !== "disabled" ||
    r.includesDefaultBranch !== true ||
    r.requiredApprovingReviewCount !== 0 ||
    r.requiresStatusChecks !== false ||
    r.requiredReviewThreadResolution !== true
  )
    errors.push("unverified or altered branch-protection finding");
  if (
    a.enabled !== true ||
    a.allowedActions !== "all" ||
    a.shaPinningRequired !== false ||
    a.defaultWorkflowPermissions !== "read" ||
    a.canApprovePullRequestReviews !== false
  )
    errors.push("Actions governance findings changed without live inspection");
  if (e.count !== 0) errors.push("staging/production environment status misrepresented");
  if (
    !Array.isArray(record.requiredBeforeRelease) ||
    JSON.stringify(record.requiredBeforeRelease) !== JSON.stringify(REQUIREMENTS)
  )
    errors.push("required governance remediations missing");
  if (
    !releasePolicy ||
    releasePolicy.state !== "SOURCE_ONLY_HOLD" ||
    releasePolicy.deploymentAllowed !== false ||
    releasePolicy.requiredEvidence?.some((x) => x.verified !== false)
  )
    errors.push("R8 release HOLD or unverified external requirements changed");
  if (
    typeof workflowText !== "string" ||
    !REQUIRED_CI_JOBS.every((j) => workflowText.includes(j)) ||
    !/permissions:\s*\n\s*contents: read/.test(workflowText) ||
    !/npm run check:r8-release-hold/.test(workflowText)
  )
    errors.push("read-only CI or required security gates missing");
  if (docsPresent !== true) errors.push("governance decision packet missing");
  return errors;
}
export function inspectR8a(root) {
  const obs = JSON.parse(
    readFileSync(
      path.join(root, "infrastructure/cloudflare/r8a-governance-observation.json"),
      "utf8",
    ),
  );
  const releasePolicy = JSON.parse(
    readFileSync(path.join(root, "infrastructure/cloudflare/r8-release-readiness.json"), "utf8"),
  );
  const workflowText = readFileSync(
    path.join(root, ".github/workflows/r1-pr-validation.yml"),
    "utf8",
  );
  const docsPresent = readdirSync(path.join(root, "docs/security")).includes(
    "ALP-D02-E-R8A-governance.md",
  );
  const errors = verifyR8aGovernance(obs, { workflowText, releasePolicy, docsPresent });
  return {
    status: errors.length ? "BLOCKED" : "GOVERNANCE_HOLD_VERIFIED",
    errors,
    releaseAllowed: false,
    requiredRemediations: REQUIREMENTS.length,
    observationDate: obs.observedAtUtc,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const r = inspectR8a(root);
  if (r.errors.length) {
    console.error("R8A FAIL: " + r.errors.join("; "));
    process.exitCode = 1;
  } else {
    console.log("R8A PASS: governance findings preserved at " + r.observationDate);
    console.log(
      "R8A HOLD: " +
        r.requiredRemediations +
        " release controls require verification or authorization; no deployment GO",
    );
  }
}
