// R8B: source-only proposed ruleset review. NEVER invokes GitHub API or mutates settings.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const EXACT_CHECKS = Object.freeze([
  "Foundation / Academic static and unit gates",
  "R7 Cloudflare workerd local runtime (source-only)",
  "R1 restricted executor (disposable database)",
]);
const EXACT_TYPES = ["deletion", "non_fast_forward", "pull_request", "required_status_checks"];
export function validateR8bProposal(proposal, { r8, r8a, workflow, docPresent } = {}) {
  const errors = [];
  if (
    proposal?.schemaVersion !== 1 ||
    proposal?.workstream !== "ALP-D02-E-R8B" ||
    proposal?.status !== "PROPOSED_UNAPPLIED" ||
    proposal?.authorizedToApply !== false ||
    proposal?.repository !== "73junito/autolearnpro" ||
    proposal?.branch !== "main" ||
    proposal?.targetRulesetId !== 26665434 ||
    proposal?.expectedObservedEnforcement !== "disabled"
  )
    errors.push("R8B requires unapplied, unapproved proposal matching observed ruleset");
  const evidence = proposal?.checkEvidence || {};
  if (
    !/^[0-9a-f]{40}$/.test(evidence.observedCommit || "") ||
    evidence.githubApp !== "github-actions" ||
    evidence.excludedCheck?.name !== "Supabase Preview"
  )
    errors.push("source check-run identity evidence missing");
  const rule = proposal?.proposedRuleset || {};
  if (
    rule.name !== "protect-main-foundation" ||
    rule.target !== "branch" ||
    rule.enforcement !== "active" ||
    JSON.stringify(rule.conditions) !==
      JSON.stringify({ ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } }) ||
    !Array.isArray(rule.bypass_actors) ||
    rule.bypass_actors.length !== 0
  )
    errors.push("proposed ruleset scope, enforcement or bypass is unsafe");
  const rules = rule.rules || [];
  if (
    !Array.isArray(rules) ||
    rules.length !== 4 ||
    rules.some((r, i) => r.type !== EXACT_TYPES[i])
  )
    errors.push("ruleset missing required protections or contains extraneous rules");
  const pr = rules.find((r) => r.type === "pull_request")?.parameters || {};
  if (
    pr.required_approving_review_count !== 1 ||
    pr.dismiss_stale_reviews_on_push !== true ||
    pr.require_last_push_approval !== true ||
    pr.required_review_thread_resolution !== true ||
    JSON.stringify(pr.allowed_merge_methods) !== '["merge"]'
  )
    errors.push("independent approvals and merge policy not enforced in proposal");
  const checks = rules.find((r) => r.type === "required_status_checks")?.parameters || {};
  if (
    checks.strict_required_status_checks_policy !== true ||
    !Array.isArray(checks.required_status_checks) ||
    JSON.stringify(checks.required_status_checks.map((x) => x.context)) !==
      JSON.stringify(EXACT_CHECKS) ||
    checks.required_status_checks.some((x) => x.integration_id !== null)
  )
    errors.push("required status check names drifted from validated Actions jobs");
  if (
    typeof workflow !== "string" ||
    !EXACT_CHECKS.every((n) => workflow.includes("name: " + n)) ||
    !/permissions:\s*\n\s*contents: read/.test(workflow)
  )
    errors.push("source CI no longer provides every required check or read-only permissions");
  if (
    !r8 ||
    r8.deploymentAllowed !== false ||
    r8.state !== "SOURCE_ONLY_HOLD" ||
    !r8a ||
    r8a.releaseAllowed !== false ||
    r8a.status !== "GOVERNANCE_HOLD"
  )
    errors.push("R8/R8A must remain source-only release HOLD");
  if (
    !Array.isArray(proposal?.approvalPreconditions) ||
    proposal.approvalPreconditions.length !== 6 ||
    !Array.isArray(proposal?.postActivationEvidence) ||
    proposal.postActivationEvidence.length !== 5 ||
    !proposal.approvalPreconditions.some((s) => s.includes("independent reviewer")) ||
    !proposal.approvalPreconditions.some((s) => s.includes("Explicit written GO"))
  )
    errors.push("lockout and human authorization preconditions incomplete");
  if (docPresent !== true) errors.push("R8B decision and rollback packet absent");
  return [...new Set(errors)];
}
export function inspectR8b(root) {
  const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
  const proposal = read("infrastructure/cloudflare/r8b-protection-proposal.json");
  const r8 = read("infrastructure/cloudflare/r8-release-readiness.json");
  const r8a = read("infrastructure/cloudflare/r8a-governance-observation.json");
  const workflow = readFileSync(path.join(root, ".github/workflows/r1-pr-validation.yml"), "utf8");
  const docPresent = (() => {
    try {
      return (
        readFileSync(path.join(root, "docs/security/ALP-D02-E-R8B-protection-plan.md"), "utf8")
          .length > 40
      );
    } catch {
      return false;
    }
  })();
  const errors = validateR8bProposal(proposal, { r8, r8a, workflow, docPresent });
  return {
    status: errors.length ? "BLOCKED" : "PROPOSED_UNAPPLIED_VERIFIED",
    errors,
    settingsChanged: false,
    releaseAllowed: false,
    requiredChecks: EXACT_CHECKS,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const result = inspectR8b(root);
  if (result.errors.length) {
    console.error("R8B FAIL: " + result.errors.join("; "));
    process.exitCode = 1;
  } else {
    console.log("R8B PASS: source-only proposed ruleset and exact three CI checks validated");
    console.log(
      "R8B HOLD: no branch protection mutated; independent reviewer, owner GO and lockout preflight required",
    );
  }
}
