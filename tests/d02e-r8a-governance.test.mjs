import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  verifyR8aGovernance,
  inspectR8a,
  REQUIREMENTS,
} from "../infrastructure/scripts/check-r8a-governance.mjs";
const observation = JSON.parse(
  readFileSync("infrastructure/cloudflare/r8a-governance-observation.json", "utf8"),
);
const releasePolicy = JSON.parse(
  readFileSync("infrastructure/cloudflare/r8-release-readiness.json", "utf8"),
);
const workflowText = readFileSync(".github/workflows/r1-pr-validation.yml", "utf8");
const context = { workflowText, releasePolicy, docsPresent: true };
const clone = () => structuredClone(observation);
test("R8A records verified GitHub settings as governance HOLD, not production GO", () => {
  const result = inspectR8a(process.cwd());
  assert.equal(result.status, "GOVERNANCE_HOLD_VERIFIED");
  assert.equal(result.releaseAllowed, false);
  assert.equal(result.requiredRemediations, 10);
  assert.deepEqual(verifyR8aGovernance(clone(), context), []);
});
test("R8A refuses fabricated enabled ruleset and protected branch claims", () => {
  for (const mutate of [
    (x) => (x.observations.mainProtected = true),
    (x) => (x.observations.classicBranchProtection = "enabled"),
    (x) => (x.observations.repositoryRuleset.enforcement = "active"),
    (x) => (x.observations.repositoryRuleset.requiredApprovingReviewCount = 1),
    (x) => (x.observations.repositoryRuleset.requiresStatusChecks = true),
  ]) {
    const p = clone();
    mutate(p);
    assert.match(verifyR8aGovernance(p, context).join(" "), /branch-protection/);
  }
});
test("R8A refuses invented environment and Actions permission improvements", () => {
  for (const mutate of [
    (x) => (x.observations.actions.shaPinningRequired = true),
    (x) => (x.observations.actions.allowedActions = "selected"),
    (x) => (x.observations.actions.defaultWorkflowPermissions = "write"),
    (x) => (x.observations.environments.count = 2),
  ]) {
    const p = clone();
    mutate(p);
    assert.ok(verifyR8aGovernance(p, context).length);
  }
});
test("R8A refuses release authorization, missing governance remediations and missing decision", () => {
  const p = clone();
  p.releaseAllowed = true;
  assert.match(verifyR8aGovernance(p, context).join(" "), /GOVERNANCE_HOLD/);
  const missing = clone();
  missing.requiredBeforeRelease.pop();
  assert.match(verifyR8aGovernance(missing, context).join(" "), /remediations/);
  assert.equal(REQUIREMENTS.length, 10);
  assert.match(
    verifyR8aGovernance(clone(), { ...context, docsPresent: false }).join(" "),
    /decision packet/,
  );
});
test("R8A rejects downgraded CI, false R8 evidence and removed security gate", () => {
  const modified = workflowText.replace("r1-live-database:", "renamed-job:");
  assert.match(
    verifyR8aGovernance(clone(), { ...context, workflowText: modified }).join(" "),
    /security gates/,
  );
  const policy = structuredClone(releasePolicy);
  policy.requiredEvidence[0].verified = true;
  assert.match(
    verifyR8aGovernance(clone(), { ...context, releasePolicy: policy }).join(" "),
    /release HOLD/,
  );
});
