// R8E: fixed GET-only GitHub preflight; no mutation or deployment APIs.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXACT_CHECKS } from "./check-r8b-protection-proposal.mjs";
const REPO = "73junito/autolearnpro";
const RULESET_ID = 26665434;
const USER = "73junito";
const api = (endpoint) =>
  JSON.parse(
    execFileSync("gh", ["api", endpoint], { encoding: "utf8", timeout: 15000, maxBuffer: 2e6 }),
  );
export function assessR8e(state, proposal, { strictSnapshot = false } = {}) {
  const errors = [];
  if (
    state?.schemaVersion !== 1 ||
    state?.workstream !== "ALP-D02-E-R8E" ||
    state?.status !== "READ_ONLY_PRE_ACTIVATION" ||
    state?.repository !== REPO ||
    state?.authorizedToApply !== false ||
    state?.productionReleaseAllowed !== false
  )
    errors.push("R8E must be an unauthorized read-only preflight");
  if (
    !/^[a-f0-9]{40}$/.test(state?.mainSha || "") ||
    !/^[a-f0-9]{40}$/.test(state?.checkRunHead || "")
  )
    errors.push("GitHub evidence commit provenance missing");
  if (strictSnapshot && state?.observedDate !== "2026-11-19") errors.push("observed date mismatch");
  const b = state?.branch || {},
    r = state?.ruleset || {};
  if (
    b.name !== "main" ||
    b.protected !== false ||
    r.id !== RULESET_ID ||
    r.name !== "protect-main-foundation" ||
    r.target !== "branch" ||
    r.enforcement !== "disabled" ||
    JSON.stringify(r.conditions?.ref_name?.include) !== '["~DEFAULT_BRANCH"]' ||
    !Array.isArray(r.bypass_actors) ||
    r.bypass_actors.length !== 0 ||
    !Array.isArray(r.rules) ||
    !r.rules.some((x) => x.type === "non_fast_forward") ||
    !r.rules.some((x) => x.type === "deletion")
  )
    errors.push("observed ruleset changed: stop and inspect before any update");
  if (!Array.isArray(state?.effectiveRules) || state.effectiveRules.length !== 0)
    errors.push("effective branch rules changed from empty baseline");
  const collabs = state?.collaborators || [];
  if (
    collabs.length !== 1 ||
    collabs[0]?.login !== USER ||
    collabs[0]?.role_name !== "admin" ||
    state?.ownerPermission?.permission !== "admin" ||
    state?.ownerPermission?.user?.login !== USER
  )
    errors.push("solo-maintainer access or recovery authority not verified");
  const workflow = state?.actionsWorkflow || {};
  if (
    workflow.default_workflow_permissions !== "read" ||
    workflow.can_approve_pull_request_reviews !== false
  )
    errors.push("Actions read-only permissions changed");
  const checks = state?.checkRuns || [];
  if (
    !EXACT_CHECKS.every(
      (name) =>
        checks.filter(
          (c) =>
            c.name === name &&
            c.status === "completed" &&
            c.conclusion === "success" &&
            c.app?.slug === "github-actions",
        ).length === 1,
    )
  )
    errors.push("three successful GitHub Actions CI contexts not verified");
  const supabase = checks.find((c) => c.name === "Supabase Preview");
  if (supabase && (supabase.conclusion !== "skipped" || supabase.app?.slug !== "supabase"))
    errors.push("external preview check evidence changed");
  if (
    proposal?.status !== "SOLO_GOVERNANCE_PROPOSED_UNAPPLIED" ||
    proposal?.authorizedToApply !== false ||
    proposal?.releaseAllowed !== false ||
    proposal?.operatingModel?.approvingHumanReviewsRequired !== 0 ||
    proposal?.proposedRuleset?.enforcement !== "active" ||
    proposal?.proposedRuleset?.rules?.find((x) => x.type === "pull_request")?.parameters
      ?.required_approving_review_count !== 0 ||
    JSON.stringify(
      proposal?.proposedRuleset?.rules
        ?.find((x) => x.type === "required_status_checks")
        ?.parameters?.required_status_checks?.map((x) => x.context),
    ) !== JSON.stringify(EXACT_CHECKS)
  )
    errors.push("R8D solo governance proposal drifted");
  return [...new Set(errors)];
}
export function captureLiveReadOnly(fixture) {
  const rawRuleset = api(`repos/${REPO}/rulesets/${RULESET_ID}`);
  const branch = api(`repos/${REPO}/branches/main`);
  const collabs = api(`repos/${REPO}/collaborators?per_page=100`);
  const permission = api(`repos/${REPO}/collaborators/${USER}/permission`);
  const effective = api(`repos/${REPO}/rules/branches/main`);
  const wf = api(`repos/${REPO}/actions/permissions/workflow`);
  const run = api(`repos/${REPO}/commits/${fixture.checkRunHead}/check-runs?per_page=100`);
  if (run.total_count > 100 || collabs.length === 100)
    throw Error("API pagination needed; refusing partial security inventory");
  return {
    ...fixture,
    branch: { name: branch.name, protected: branch.protected },
    mainSha: branch.commit.sha,
    ruleset: rawRuleset,
    effectiveRules: effective,
    collaborators: collabs.map((c) => ({ login: c.login, role_name: c.role_name })),
    ownerPermission: { permission: permission.permission, user: { login: permission.user.login } },
    actionsWorkflow: wf,
    checkRuns: run.check_runs.map((c) => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
      app: { slug: c.app.slug },
    })),
  };
}
export function inspectR8e(root, { live = false } = {}) {
  const read = (n) =>
    JSON.parse(readFileSync(path.join(root, "infrastructure/cloudflare", n), "utf8"));
  const fixture = read("r8e-readiness-observation.json");
  const proposal = read("r8d-solo-governance-proposal.json");
  const state = live ? captureLiveReadOnly(fixture) : fixture;
  const errors = assessR8e(state, proposal, { strictSnapshot: !live });
  return {
    status: errors.length ? "HOLD_REINSPECT" : "READY_FOR_OWNER_DECISION_ONLY",
    errors,
    liveCheckPerformed: live,
    settingsModified: false,
    authorizedToApply: false,
    observedMainSha: state.mainSha,
    checkRunHead: state.checkRunHead,
    requiredChecks: EXACT_CHECKS.length,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const args = process.argv.slice(2);
  if (args.some((x) => x !== "--live")) {
    console.error("Only --live supported; no write mode exists");
    process.exitCode = 2;
  } else {
    try {
      const result = inspectR8e(root, { live: args.includes("--live") });
      console.log(
        "R8E " + (result.errors.length ? "HOLD" : "PASS") + ": " + JSON.stringify(result),
      );
      console.log(
        "R8E GOVERNANCE HOLD: preflight is GET-only; no authorization to apply protection, provision secrets or deploy",
      );
      if (result.errors.length) process.exitCode = 1;
    } catch (error) {
      console.error("R8E FAIL CLOSED: " + error.message);
      process.exitCode = 1;
    }
  }
}
