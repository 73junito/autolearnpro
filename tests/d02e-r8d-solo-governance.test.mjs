import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateR8dSoloPolicy,
  inspectR8d,
} from "../infrastructure/scripts/check-r8d-solo-governance.mjs";
const read = (n) => JSON.parse(readFileSync("infrastructure/cloudflare/" + n, "utf8"));
const p = read("r8d-solo-governance-proposal.json");
const context = {
  r8: read("r8-release-readiness.json"),
  r8a: read("r8a-governance-observation.json"),
  r8b: read("r8b-protection-proposal.json"),
  r8c: read("r8c-activation-preflight.json"),
  workflow: readFileSync(".github/workflows/r1-pr-validation.yml", "utf8"),
  decisionExists: true,
};
const clone = () => structuredClone(p);
test("R8D retains solo-maintainer model and source-only HOLD", () => {
  const status = inspectR8d(process.cwd());
  assert.equal(status.status, "SOLO_GOVERNANCE_HOLD_VERIFIED", status.errors.join("; "));
  assert.equal(status.settingsChanged, false);
  assert.equal(status.releaseAllowed, false);
  assert.equal(status.requiredChecks, 3);
});
test("R8D refuses implicit settings activation or production release", () => {
  for (const mutate of [
    (x) => (x.authorizedToApply = true),
    (x) => (x.releaseAllowed = true),
    (x) => (x.status = "ACTIVE"),
    (x) => (x.operatingModel.productionDeploymentSeparateGo = false),
  ]) {
    const x = clone();
    mutate(x);
    assert.ok(validateR8dSoloPolicy(x, context).length);
  }
});
test("R8D preserves zero required human reviews without weakening PR or CI", () => {
  for (const mutate of [
    (x) => (x.operatingModel.approvingHumanReviewsRequired = 1),
    (x) => (x.operatingModel.prRequired = false),
    (x) => (x.proposedRuleset.rules[2].parameters.required_approving_review_count = 1),
    (x) => (x.proposedRuleset.rules[2].parameters.required_review_thread_resolution = false),
    (x) => x.proposedRuleset.rules[3].parameters.required_status_checks.pop(),
    (x) => (x.proposedRuleset.rules[3].parameters.strict_required_status_checks_policy = false),
  ]) {
    const x = clone();
    mutate(x);
    assert.ok(validateR8dSoloPolicy(x, context).length);
  }
});
test("R8D does not permit bypass actors, force-push or deletion", () => {
  for (const mutate of [
    (x) => x.proposedRuleset.bypass_actors.push({ actor_id: 1 }),
    (x) => x.proposedRuleset.rules.shift(),
    (x) => x.proposedRuleset.rules.splice(1, 1),
    (x) => (x.proposedRuleset.conditions.ref_name.include = ["other-branch"]),
  ]) {
    const x = clone();
    mutate(x);
    assert.ok(validateR8dSoloPolicy(x, context).length);
  }
});
test("R8D excludes skipped preview and protects verified check identity", () => {
  for (const mutate of [
    (x) => (x.excludedCheck = ""),
    (x) =>
      (x.proposedRuleset.rules[3].parameters.required_status_checks[0].context =
        "Supabase Preview"),
    (x) => (x.proposedRuleset.rules[3].parameters.required_status_checks[0].integration_id = 1),
  ]) {
    const x = clone();
    mutate(x);
    assert.ok(validateR8dSoloPolicy(x, context).length);
  }
});
test("R8D preserves earlier evidence as historical records", () => {
  assert.match(
    validateR8dSoloPolicy(clone(), {
      ...context,
      r8: { ...context.r8, deploymentAllowed: true },
    }).join(" "),
    /HOLD/,
  );
  assert.match(
    validateR8dSoloPolicy(clone(), {
      ...context,
      r8c: { ...context.r8c, status: "ACTIVATED" },
    }).join(" "),
    /HOLD/,
  );
  assert.match(
    validateR8dSoloPolicy(clone(), { ...context, decisionExists: false }).join(" "),
    /decision/,
  );
});
