#!/usr/bin/env node
// Read-only reconciliation gate. Does not commit, deploy, apply migrations, or contact databases.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const parent = dirname(root);
const studio = resolve(root, "meshy-studio");
const c3 = resolve(parent, "autolearnpro-c3-r25-integration");
const review = resolve(parent, "autolearnpro-c3-review-workspaces");
const academicFile = resolve(root, "apps/web/src/academic.mjs");
const executorFile = resolve(
  root,
  "supabase/migrations/20261027070320_academic_executor_rls_boundary.sql",
);
const findings = [];
const checks = [];
const check = (id, passed, detail, blocking = true) => {
  checks.push({ id, passed, blocking, detail });
  if (!passed && blocking) findings.push(id);
};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
function git(cwd, ...args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
const academic = read(academicFile);
const executor = read(executorFile);
const contract = read(
  resolve(root, "supabase/migrations/20261106054347_academic_executor_r1_restricted_contract.sql"),
);
const matches = academic.match(/SET\s+LOCAL\s+ROLE\s+service_role/gi) ?? [];
check("foundation-source-present", Boolean(academic), "Academic API must exist");
check(
  "restricted-api-role",
  Boolean(academic) &&
    matches.length === 0 &&
    academic.includes("SET LOCAL ROLE alp_academic_executor"),
  `Academic API contains ${matches.length} service_role transaction statements (BYPASSRLS)`,
);
check(
  "restricted-executor-contract-present",
  executor.includes("NOBYPASSRLS") &&
    contract.includes("alp_academic_executor_quota_own") &&
    contract.includes("alp_academic_executor_role_self_read"),
  "Source-level least-privilege and RLS policy migration is present (not yet applied)",
);
const migrations = resolve(root, "supabase/migrations");
const rls = read(resolve(migrations, "20261027000000_academic_rls_hardening.sql"));
const actorTest = read(resolve(root, "tests/academic-rls.test.mjs"));
check(
  "rls-policy-actor-contract",
  /auth\.uid\(\)/.test(rls) &&
    contract.includes("ALTER POLICY") &&
    contract.includes("alp_current_actor") &&
    academic.includes("set_config('request.jwt.claim.sub'") &&
    actorTest.includes("request.jwt.claim.sub"),
  "Source-level auth.uid() identity contract matches API binding and restricted policies",
);
check(
  "dedicated-academic-login-guard",
  academic.includes("ALP_ACADEMIC_DATABASE_URL") &&
    academic.includes("rolbypassrls") &&
    academic.includes("rolsuper"),
  "Academic database connection rejects privileged login credentials",
);
let validation = null;
try {
  validation = JSON.parse(
    read(resolve(root, "_local/evidence/r1-scratch-validation-20261106.json")),
  );
} catch {
  /* No scratch evidence yet. */
}
const hashesMatch =
  validation?.sourceSha256 &&
  Object.entries(validation.sourceSha256).every(([relative, expected]) => {
    const file = resolve(root, relative);
    if (!existsSync(file)) return false;
    return createHash("sha256").update(readFileSync(file)).digest("hex") === expected;
  });
const r1Verified = Boolean(
  hashesMatch &&
  validation?.schema === "alp-r1-scratch-validation-v2" &&
  validation.migrationReplay?.count === 20 &&
  validation.migrationReplay?.result === "pass" &&
  validation.checks?.academicRestrictedRls?.passed === 1 &&
  validation.checks?.academicRestrictedRls?.skipped === 0 &&
  validation.checks?.academicHttpRestrictedLogin?.passed === 1 &&
  validation.checks?.academicHttpRestrictedLogin?.skipped === 0 &&
  validation.checks?.academicProgressHttp?.passed === 1 &&
  validation.checks?.academicProgressHttp?.skipped === 0,
);
check(
  "isolated-r1-database-verification",
  r1Verified,
  "Recorded scratch replay and RLS/HTTP evidence must match current source hashes",
);
check(
  "independent-c3-review",
  false,
  "C3-R37G candidate requires independent review before a merge",
);
let r2 = null;
try {
  r2 = JSON.parse(
    read(resolve(root, "docs/governance/r2-academic-administrator-scope-decision-2026-11-06.json")),
  );
} catch {
  /* no approved scope record */
}
const r2Scoped =
  r2?.schema === "alp-r2-scope-decision-v1" &&
  r2?.decisionId === "R2" &&
  r2?.status === "owner-directed" &&
  r2?.option === "A" &&
  r2?.academicAdministratorInStage2 === false &&
  r2?.deploymentAuthorized === false;
check(
  "r2-administrator-scope-decision",
  r2Scoped,
  "R2 Option A excludes administrator-specific academic capability from Stage 2",
);
check(
  "integration-owner-acceptance",
  false,
  "C3 integration acceptance, independently reviewed trust anchor and deployment approval remain outstanding",
);
check(
  "meshy-studio-present",
  existsSync(resolve(studio, "package.json")),
  "Standalone Meshy package manifest",
);
check(
  "c3-worktree-present",
  git(c3, "rev-parse", "--show-toplevel") !== null,
  "External C3 worktree must exist and be a Git repository",
);
check(
  "c3-review-workspaces-present",
  existsSync(review),
  "Preserve independent C3 review candidates",
);
const trees = git(root, "worktree", "list", "--porcelain") ?? "";
check(
  "registered-worktree",
  trees.toLowerCase().includes(c3.replaceAll("\\", "/").toLowerCase()),
  "Git must recognize relocated C3 integration worktree",
);
check(
  "no-release-authorization",
  false,
  "Scratch RLS validation is not production certification; owner approval, independent C3 review, and deployment authorization are still required",
  false,
);

const report = {
  schema: "alp-integration-readiness-v1",
  generatedAt: new Date().toISOString(),
  root,
  studio,
  c3,
  review,
  mergeReady: findings.length === 0 && false,
  deploymentAuthorized: false,
  checks,
  blockers: findings,
  note: "Static preflight with hash-bound historical scratch evidence. No production or complete C3 integration verification.",
};
const output = resolve(root, "_local/evidence/integration-readiness-latest.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
for (const item of checks)
  console.log(
    `${item.passed ? "PASS" : item.blocking ? "BLOCK" : "INFO"} ${item.id}: ${item.detail}`,
  );
console.log(`MERGE_READY=false DEPLOYMENT_AUTHORIZED=false REPORT=${output}`);
process.exitCode = findings.length ? 2 : 0;
