# D02-E-R8F — Branch protection acceptance record

This document is the permanent evidence record for an isolated GitHub branch protection acceptance test.

## Scope
- Repository: 73junito/autolearnpro
- Base: protected main
- Ruleset: 26665434 (protect-main-foundation)
- Required checks: Foundation / Academic static and unit gates; R7 Cloudflare workerd local runtime (source-only); R1 restricted executor (disposable database)
- Sole developer: zero mandatory human approvals
- No source deployment, hosted database migration, DNS, secrets, or production changes authorized

## Test procedure
1. Create a PR based on current protected main.
2. Introduce a deliberately failing regression test *on the temporary PR branch only*.
3. Observe GitHub Actions failure and confirm GitHub merge state blocks the PR.
4. Restore the regression test exactly, preserving only this evidence document.
5. Confirm all three required status checks succeed and the PR is eligible for merge.
6. Merge without bypassing repository rules. Record commit and check evidence in PR discussion or follow-up record.

## Guardrails
A failed CI check must never be merged. The intentional failure is not a product feature and must not persist in main. Do not weaken or disable branch protection to allow the test to pass.
