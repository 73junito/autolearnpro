// R8D: source-only solo-maintainer policy. Never applies a ruleset or calls GitHub.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXACT_CHECKS } from "./check-r8b-protection-proposal.mjs";
const TYPES = ["deletion", "non_fast_forward", "pull_request", "required_status_checks"];
export function validateR8dSoloPolicy(p, { r8, r8a, r8b, r8c, workflow, decisionExists } = {}) {
  const errors = [];
  if (
    p?.schemaVersion !== 1 ||
    p?.workstream !== "ALP-D02-E-R8D" ||
    p?.status !== "SOLO_GOVERNANCE_PROPOSED_UNAPPLIED" ||
    p?.authorizedToApply !== false ||
    p?.releaseAllowed !== false ||
    p?.repository !== "73junito/autolearnpro" ||
    p?.branch !== "main" ||
    p?.supersedesPolicy !== "ALP-D02-E-R8B" ||
    p?.supersedesReviewerBlocker !== "ALP-D02-E-R8C"
  )
    errors.push("R8D must remain an unapplied source-only solo governance proposal");
  const model = p?.operatingModel || {};
  if (
    model.humanMaintainers !== 1 ||
    model.owner !== "73junito" ||
    model.aiReviewRole !== "advisory-only" ||
    model.prRequired !== true ||
    model.approvingHumanReviewsRequired !== 0 ||
    model.manualSourceMergeAllowedOnlyAfterRequiredChecks !== true ||
    model.productionDeploymentSeparateGo !== true
  )
    errors.push("solo-maintainer model or release authority drifted");
  const old = p?.observedGitHub || {};
  if (
    !/^2026-\d{2}-\d{2}$/.test(old.observedDate || "") ||
    !/^[a-f0-9]{40}$/.test(old.observedMainSha || "") ||
    old.protected !== false ||
    old.rulesetId !== 26665434 ||
    old.rulesetEnforcement !== "disabled" ||
    JSON.stringify(old.observedCollaboratorLogins) !== '["73junito"]'
  )
    errors.push("historical GitHub protection state was falsely upgraded");
  const proposed = p?.proposedRuleset || {};
  if (
    proposed.name !== "protect-main-foundation" ||
    proposed.target !== "branch" ||
    proposed.enforcement !== "active" ||
    JSON.stringify(proposed.conditions) !==
      JSON.stringify({ ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } }) ||
    !Array.isArray(proposed.bypass_actors) ||
    proposed.bypass_actors.length !== 0
  )
    errors.push("proposed branch scope or bypass is unsafe");
  const rules = proposed.rules || [];
  if (!Array.isArray(rules) || rules.length !== 4 || rules.some((x, i) => x.type !== TYPES[i]))
    errors.push("proposed branch restrictions incomplete");
  const pr = rules.find((x) => x.type === "pull_request")?.parameters || {};
  if (
    pr.required_approving_review_count !== 0 ||
    pr.dismiss_stale_reviews_on_push !== false ||
    pr.require_last_push_approval !== false ||
    pr.require_code_owner_review !== false ||
    pr.required_review_thread_resolution !== true ||
    JSON.stringify(pr.allowed_merge_methods) !== '["merge"]'
  )
    errors.push("solo PR approval count, threads or merge strategy invalid");
  const status = rules.find((x) => x.type === "required_status_checks")?.parameters || {};
  if (
    status.strict_required_status_checks_policy !== true ||
    !Array.isArray(status.required_status_checks) ||
    JSON.stringify(status.required_status_checks.map((x) => x.context)) !==
      JSON.stringify(EXACT_CHECKS) ||
    status.required_status_checks.some((x) => x.integration_id !== null)
  )
    errors.push("mandatory three CI job contexts drifted");
  if (p?.excludedCheck !== "Supabase Preview")
    errors.push("skipped Supabase Preview must stay excluded");
  if (
    typeof workflow !== "string" ||
    !EXACT_CHECKS.every((x) => workflow.includes("name: " + x)) ||
    !/permissions:\s*\n\s*contents: read/.test(workflow) ||
    !/npm run check:r8-release-hold/.test(workflow)
  )
    errors.push("required source-only CI contract missing");
  if (
    r8?.state !== "SOURCE_ONLY_HOLD" ||
    r8?.deploymentAllowed !== false ||
    r8a?.status !== "GOVERNANCE_HOLD" ||
    r8a?.releaseAllowed !== false ||
    r8b?.status !== "PROPOSED_UNAPPLIED" ||
    r8b?.authorizedToApply !== false ||
    r8c?.status !== "ACTIVATION_BLOCKED" ||
    r8c?.authorizedToApply !== false
  )
    errors.push("historic release HOLD evidence or original proposal tampered");
  if (
    !Array.isArray(p?.activationPreconditions) ||
    p.activationPreconditions.length !== 6 ||
    !p.activationPreconditions.some((s) => s.includes("separate explicit GO")) ||
    !p.activationPreconditions.some((s) => s.includes("recovery runbook")) ||
    !Array.isArray(p?.postActivationVerification) ||
    p.postActivationVerification.length !== 5
  )
    errors.push("activation authority, recoverability or verification missing");
  if (decisionExists !== true) errors.push("R8D solo-maintainer governance decision missing");
  return [...new Set(errors)];
}
export function inspectR8d(root) {
  const load = (n) =>
    JSON.parse(readFileSync(path.join(root, "infrastructure/cloudflare", n), "utf8"));
  const p = load("r8d-solo-governance-proposal.json");
  const r8 = load("r8-release-readiness.json");
  const r8a = load("r8a-governance-observation.json");
  const r8b = load("r8b-protection-proposal.json");
  const r8c = load("r8c-activation-preflight.json");
  const workflow = readFileSync(path.join(root, ".github/workflows/r1-pr-validation.yml"), "utf8");
  let decisionExists = false;
  try {
    decisionExists =
      readFileSync(path.join(root, "docs/security/ALP-D02-E-R8D-solo-governance.md"), "utf8")
        .length > 50;
  } catch {}
  const errors = validateR8dSoloPolicy(p, { r8, r8a, r8b, r8c, workflow, decisionExists });
  return {
    status: errors.length ? "BLOCKED" : "SOLO_GOVERNANCE_HOLD_VERIFIED",
    errors,
    settingsChanged: false,
    releaseAllowed: false,
    requiredChecks: EXACT_CHECKS.length,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const check = inspectR8d(root);
  if (check.errors.length) {
    console.error("R8D FAIL: " + check.errors.join("; "));
    process.exitCode = 1;
  } else {
    console.log(
      "R8D PASS: proposed solo developer PR governance, 0 human reviews, 3 required CI checks",
    );
    console.log(
      "R8D HOLD: branch ruleset unchanged; separate owner GO required before activation or production deployment",
    );
  }
}
