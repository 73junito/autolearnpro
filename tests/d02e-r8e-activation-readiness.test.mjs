import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assessR8e,
  inspectR8e,
} from "../infrastructure/scripts/check-r8e-activation-readiness.mjs";
const read = (n) => JSON.parse(readFileSync("infrastructure/cloudflare/" + n, "utf8"));
const base = read("r8e-readiness-observation.json");
const proposal = read("r8d-solo-governance-proposal.json");
const clone = () => structuredClone(base);
test("R8E fixture validates sole owner and three exact green Actions checks", () => {
  const r = inspectR8e(process.cwd());
  assert.equal(r.status, "READY_FOR_OWNER_DECISION_ONLY", r.errors.join("; "));
  assert.equal(r.settingsModified, false);
  assert.equal(r.authorizedToApply, false);
  assert.equal(r.liveCheckPerformed, false);
  assert.equal(r.requiredChecks, 3);
});
test("R8E blocks implicit activation and production release", () => {
  for (const modify of [
    (x) => (x.authorizedToApply = true),
    (x) => (x.productionReleaseAllowed = true),
    (x) => (x.status = "ACTIVATED"),
    (x) => (x.schemaVersion = 2),
  ]) {
    const x = clone();
    modify(x);
    assert.ok(assessR8e(x, proposal).length);
  }
});
test("R8E fails if branch or effective rules diverge from observed baseline", () => {
  for (const modify of [
    (x) => (x.branch.protected = true),
    (x) => (x.ruleset.enforcement = "active"),
    (x) => x.ruleset.bypass_actors.push({ actor_type: "RepositoryRole" }),
    (x) => x.effectiveRules.push({ type: "pull_request" }),
    (x) => (x.ruleset.rules = x.ruleset.rules.filter((r) => r.type !== "non_fast_forward")),
  ]) {
    const x = clone();
    modify(x);
    assert.ok(assessR8e(x, proposal).length);
  }
});
test("R8E detects admin access and Actions permission drift", () => {
  for (const modify of [
    (x) => x.collaborators.push({ login: "unknown", role_name: "write" }),
    (x) => (x.ownerPermission.permission = "write"),
    (x) => (x.actionsWorkflow.default_workflow_permissions = "write"),
    (x) => (x.actionsWorkflow.can_approve_pull_request_reviews = true),
  ]) {
    const x = clone();
    modify(x);
    assert.ok(assessR8e(x, proposal).length);
  }
});
test("R8E rejects stale, skipped or non-Actions required status checks", () => {
  for (const modify of [
    (x) => (x.checkRuns[0].conclusion = "failure"),
    (x) => (x.checkRuns[1].status = "in_progress"),
    (x) => (x.checkRuns[2].app.slug = "other"),
    (x) => (x.checkRuns[0].name = "wrong check"),
    (x) => x.checkRuns.push(structuredClone(x.checkRuns[0])),
  ]) {
    const x = clone();
    modify(x);
    assert.ok(assessR8e(x, proposal).length);
  }
});
test("R8E proposal validation stays zero-review, three-check, release HOLD", () => {
  const x = structuredClone(proposal);
  x.proposedRuleset.rules[2].parameters.required_approving_review_count = 1;
  assert.match(assessR8e(clone(), x).join(" "), /proposal drifted/);
  const y = structuredClone(proposal);
  y.authorizedToApply = true;
  assert.match(assessR8e(clone(), y).join(" "), /proposal drifted/);
});

// Temporary R8F negative control. MUST be removed before merge.
test("R8F intentionally failing branch protection negative control", () => {
  assert.fail("R8F negative control: required CI must block this PR");
});
