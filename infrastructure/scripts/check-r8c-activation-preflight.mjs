// R8C: check only the recorded, read-only preflight. This does not call GitHub.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXACT_CHECKS } from "./check-r8b-protection-proposal.mjs";
export function checkR8c(record, { r8, r8a, r8b, decisionExists } = {}) {
  const issues = [];
  if (
    record?.schemaVersion !== 1 ||
    record?.workstream !== "ALP-D02-E-R8C" ||
    record?.status !== "ACTIVATION_BLOCKED" ||
    record?.authorizedToApply !== false ||
    record?.releaseAllowed !== false ||
    record?.repository !== "73junito/autolearnpro"
  )
    issues.push("R8C must remain unauthorized ACTI​VATION_BLOCKED".replace("\u200b", ""));
  if (
    !/^2026-\d{2}-\d{2}$/.test(record?.observedUtcDate || "") ||
    !/^[0-9a-f]{40}$/.test(record?.observedMainSha || "")
  )
    issues.push("R8C observation provenance missing");
  const obs = record?.liveObservations || {};
  if (
    obs.mainProtected !== false ||
    obs.ruleset?.id !== 26665434 ||
    obs.ruleset?.name !== "protect-main-foundation" ||
    obs.ruleset?.enforcement !== "disabled" ||
    obs.ruleset?.requiredApprovingReviewCount !== 0 ||
    obs.ruleset?.hasRequiredStatusChecks !== false
  )
    issues.push("GitHub protection observation is falsely upgraded");
  const c = obs.repositoryCollaborators || {};
  if (c.count !== 1 || c.adminLogin !== "73junito" || c.independentReviewerAvailable !== false)
    issues.push("unverified independent reviewer claim");
  const a = obs.githubActions || {};
  if (
    a.defaultWorkflowPermissions !== "read" ||
    a.canApprovePullRequestReviews !== false ||
    a.allowedActions !== "all" ||
    a.shaPinningRequired !== false ||
    obs.deploymentEnvironments !== 0
  )
    issues.push("GitHub Actions and environment observation drift");
  if (
    !Array.isArray(obs.verifiedChecks) ||
    JSON.stringify(obs.verifiedChecks.map((x) => x.context)) !== JSON.stringify(EXACT_CHECKS) ||
    obs.verifiedChecks.some((x) => x.conclusion !== "success" || x.app !== "github-actions") ||
    !Array.isArray(obs.excludedChecks) ||
    obs.excludedChecks.length !== 1 ||
    obs.excludedChecks[0].context !== "Supabase Preview" ||
    obs.excludedChecks[0].conclusion !== "skipped"
  )
    issues.push("required CI check-run evidence is unverified");
  if (
    !Array.isArray(record?.activationBlockers) ||
    record.activationBlockers.length !== 3 ||
    !record.activationBlockers.some((x) => /Independent reviewer/.test(x))
  )
    issues.push("reviewer lockout blockers absent");
  if (
    !Array.isArray(record?.requiredOwnerDecisions) ||
    record.requiredOwnerDecisions.length !== 3 ||
    !Array.isArray(record?.postApprovalPreflight) ||
    record.postApprovalPreflight.length !== 7
  )
    issues.push("owner authorization and verification sequence incomplete");
  if (
    r8?.state !== "SOURCE_ONLY_HOLD" ||
    r8?.deploymentAllowed !== false ||
    r8a?.status !== "GOVERNANCE_HOLD" ||
    r8a?.releaseAllowed !== false ||
    r8b?.status !== "PROPOSED_UNAPPLIED" ||
    r8b?.authorizedToApply !== false
  )
    issues.push("prior release and ruleset HOLD no longer preserved");
  if (decisionExists !== true) issues.push("R8C human decision packet missing");
  return [...new Set(issues)];
}
export function inspectR8c(root) {
  const load = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
  const record = load("infrastructure/cloudflare/r8c-activation-preflight.json");
  const r8 = load("infrastructure/cloudflare/r8-release-readiness.json");
  const r8a = load("infrastructure/cloudflare/r8a-governance-observation.json");
  const r8b = load("infrastructure/cloudflare/r8b-protection-proposal.json");
  let decisionExists = false;
  try {
    decisionExists =
      readFileSync(path.join(root, "docs/security/ALP-D02-E-R8C-activation-preflight.md"), "utf8")
        .length > 50;
  } catch {}
  const issues = checkR8c(record, { r8, r8a, r8b, decisionExists });
  return {
    status: issues.length ? "BLOCKED" : "ACTIVATION_BLOCKED_VERIFIED",
    issues,
    settingsChanged: false,
    readyToActivate: false,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const out = inspectR8c(root);
  if (out.issues.length) {
    console.error("R8C FAIL: " + out.issues.join("; "));
    process.exitCode = 1;
  } else {
    console.log(
      "R8C PASS: live-observed sole-reviewer blocker documented; no GitHub settings changed",
    );
    console.log(
      "R8C HOLD: protection activation unauthorized; independent reviewer and recovery approval required",
    );
  }
}
