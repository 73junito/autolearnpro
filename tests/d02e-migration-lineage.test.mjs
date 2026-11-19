import test from "node:test";
import assert from "node:assert/strict";
import { compareMigrationVersions } from "../infrastructure/scripts/compare-migration-lineage.mjs";

test("D02-E migration manifest compares by exact version not count", () => {
  const local = [
    "20261108000000_approval_restricted_executor.sql",
    "20261119011728_approval_actor_attestation_boundary.sql",
  ];
  const remote = [
    { version: "20261108000000", name: "approval_restricted_executor" },
    { version: "20261114202924", name: "worker_restricted_login_roles_passwordless" },
  ];
  const report = compareMigrationVersions(local, remote);
  assert.equal(report.localCount, 2);
  assert.equal(report.remoteCount, 2);
  assert.deepEqual(report.missingLocal, ["20261114202924"]);
  assert.deepEqual(report.pendingRemote, ["20261119011728"]);
  assert.equal(report.reconciled, false);
});

test("D02-E matching manifests reconcile and duplicates fail closed", () => {
  const local = ["20261108000000_approval_restricted_executor.sql"];
  const remote = [{ version: "20261108000000", name: "approval_restricted_executor" }];
  assert.equal(compareMigrationVersions(local, remote).reconciled, true);
  assert.throws(() => compareMigrationVersions(local, [remote[0], remote[0]]), /Duplicate remote/);
  assert.throws(() => compareMigrationVersions([local[0], local[0]], remote), /Duplicate local/);
});
