import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkR8c, inspectR8c } from "../infrastructure/scripts/check-r8c-activation-preflight.mjs";
const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const original = load("infrastructure/cloudflare/r8c-activation-preflight.json");
const ctx = {
  r8: load("infrastructure/cloudflare/r8-release-readiness.json"),
  r8a: load("infrastructure/cloudflare/r8a-governance-observation.json"),
  r8b: load("infrastructure/cloudflare/r8b-protection-proposal.json"),
  decisionExists: true,
};
const copy = () => structuredClone(original);
test("R8C preflight records blocker without activating settings", () => {
  const result = inspectR8c(process.cwd());
  assert.equal(result.status, "ACTIVATION_BLOCKED_VERIFIED", result.issues.join("; "));
  assert.equal(result.settingsChanged, false);
  assert.equal(result.readyToActivate, false);
  assert.deepEqual(checkR8c(copy(), ctx), []);
});
test("R8C blocks fabricated activation and GitHub protection success", () => {
  for (const mutate of [
    (x) => (x.authorizedToApply = true),
    (x) => (x.status = "ACTIVE"),
    (x) => (x.liveObservations.mainProtected = true),
    (x) => (x.liveObservations.ruleset.enforcement = "active"),
    (x) => (x.liveObservations.ruleset.requiredApprovingReviewCount = 1),
    (x) => (x.liveObservations.ruleset.hasRequiredStatusChecks = true),
  ]) {
    const v = copy();
    mutate(v);
    assert.ok(checkR8c(v, ctx).length);
  }
});
test("R8C rejects an invented independent reviewer or altered collaborator count", () => {
  for (const mutate of [
    (x) => (x.liveObservations.repositoryCollaborators.count = 2),
    (x) => (x.liveObservations.repositoryCollaborators.independentReviewerAvailable = true),
    (x) => (x.liveObservations.repositoryCollaborators.adminLogin = "different"),
  ]) {
    const v = copy();
    mutate(v);
    assert.match(checkR8c(v, ctx).join(" "), /reviewer claim/);
  }
});
test("R8C refuses a skipped preview check posing as a required success", () => {
  const v = copy();
  v.liveObservations.verifiedChecks[0].context = "Supabase Preview";
  assert.match(checkR8c(v, ctx).join(" "), /CI check-run/);
  const w = copy();
  w.liveObservations.verifiedChecks[1].conclusion = "skipped";
  assert.match(checkR8c(w, ctx).join(" "), /CI check-run/);
});
test("R8C keeps R8-R8B HOLD, human preflight and recovery prerequisites", () => {
  const v = copy();
  v.requiredOwnerDecisions.pop();
  assert.match(checkR8c(v, ctx).join(" "), /authorization/);
  const w = copy();
  w.activationBlockers = [];
  assert.match(checkR8c(w, ctx).join(" "), /blockers/);
  assert.match(
    checkR8c(copy(), { ...ctx, r8b: { ...ctx.r8b, authorizedToApply: true } }).join(" "),
    /HOLD/,
  );
  assert.match(checkR8c(copy(), { ...ctx, decisionExists: false }).join(" "), /decision packet/);
});
