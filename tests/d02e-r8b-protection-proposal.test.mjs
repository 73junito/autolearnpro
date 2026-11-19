import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateR8bProposal,
  inspectR8b,
  EXACT_CHECKS,
} from "../infrastructure/scripts/check-r8b-protection-proposal.mjs";
const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const original = load("infrastructure/cloudflare/r8b-protection-proposal.json");
const context = {
  r8: load("infrastructure/cloudflare/r8-release-readiness.json"),
  r8a: load("infrastructure/cloudflare/r8a-governance-observation.json"),
  workflow: readFileSync(".github/workflows/r1-pr-validation.yml", "utf8"),
  docPresent: true,
};
const clone = () => structuredClone(original);
test("R8B retains proposed but unapplied branch protection", () => {
  const result = inspectR8b(process.cwd());
  assert.equal(result.status, "PROPOSED_UNAPPLIED_VERIFIED", result.errors.join("; "));
  assert.equal(result.settingsChanged, false);
  assert.equal(result.releaseAllowed, false);
  assert.deepEqual(result.requiredChecks, EXACT_CHECKS);
});
test("R8B refuses implicit authorization and stale baseline assumptions", () => {
  for (const mutate of [
    (p) => (p.authorizedToApply = true),
    (p) => (p.status = "ACTIVE"),
    (p) => (p.targetRulesetId = 123),
    (p) => (p.expectedObservedEnforcement = "active"),
  ]) {
    const p = clone();
    mutate(p);
    assert.match(validateR8bProposal(p, context).join(" "), /unapplied/);
  }
});
test("R8B rejects unreviewed bypass and missing branch restrictions", () => {
  for (const mutate of [
    (p) =>
      p.proposedRuleset.bypass_actors.push({
        actor_id: 1,
        actor_type: "RepositoryRole",
        bypass_mode: "always",
      }),
    (p) =>
      (p.proposedRuleset.rules = p.proposedRuleset.rules.filter(
        (r) => r.type !== "non_fast_forward",
      )),
    (p) => (p.proposedRuleset.conditions.ref_name.include = ["refs/heads/other"]),
  ]) {
    const p = clone();
    mutate(p);
    assert.ok(validateR8bProposal(p, context).length);
  }
});
test("R8B requires independent approval and stale review rejection", () => {
  for (const mutate of [
    (p) => (p.proposedRuleset.rules[2].parameters.required_approving_review_count = 0),
    (p) => (p.proposedRuleset.rules[2].parameters.dismiss_stale_reviews_on_push = false),
    (p) => (p.proposedRuleset.rules[2].parameters.require_last_push_approval = false),
  ]) {
    const p = clone();
    mutate(p);
    assert.match(validateR8bProposal(p, context).join(" "), /independent approvals/);
  }
});
test("R8B rejects skipped preview and drifted required CI contexts", () => {
  for (const mutate of [
    (p) =>
      (p.proposedRuleset.rules[3].parameters.required_status_checks[0].context =
        "Supabase Preview"),
    (p) => p.proposedRuleset.rules[3].parameters.required_status_checks.pop(),
    (p) => (p.proposedRuleset.rules[3].parameters.strict_required_status_checks_policy = false),
  ]) {
    const p = clone();
    mutate(p);
    assert.match(validateR8bProposal(p, context).join(" "), /status check/);
  }
});
test("R8B refuses removed R8/R8A HOLD or missing human decision", () => {
  assert.match(
    validateR8bProposal(clone(), {
      ...context,
      r8: { ...context.r8, deploymentAllowed: true },
    }).join(" "),
    /release HOLD/,
  );
  assert.match(
    validateR8bProposal(clone(), { ...context, docPresent: false }).join(" "),
    /decision/,
  );
});
