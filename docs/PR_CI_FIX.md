Title: CI: Harden test-coverage workflow and wait for Postgres

Summary:

This PR hardens the `test-coverage` GitHub Actions workflow to reduce intermittent CI failures by:

- Waiting for Postgres readiness before running migrations (pg_isready loop)
- Using an explicit cache key for mix.lock (`backend/lms_api/mix.lock`)
- Safeguarding the coverage threshold check (uses Python to parse coverage JSON)
- Adding guards and an explicit `github-token` to the PR comment step to avoid failures when coverage artifacts are missing

Notes:
- The branch `ci/fix-test-coverage-workflow` is pushed and ready for PR creation.
- If `gh` is available locally, run:

```bash
gh pr create --title "$(head -n1 docs/PR_CI_FIX.md)" --body "$(tail -n +2 docs/PR_CI_FIX.md)" --base main --head ci/fix-test-coverage-workflow
```

Or open the compare URL in a browser to create the PR:

https://github.com/73junito/autolearnpro/compare/main...ci/fix-test-coverage-workflow?expand=1
