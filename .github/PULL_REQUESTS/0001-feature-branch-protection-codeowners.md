Title: chore: add CODEOWNERS and branch-protection helper (require CI checks + reviewers)

Description:

This PR adds repository governance and CI enforcement improvements:

- Adds `CODEOWNERS` to require reviews from platform/security teams for CI and sensitive code.
- Adds `scripts/set-branch-protection.sh` to configure branch protection for `main` (requires an admin PAT to run).
- Documentation: `docs/branch_protection_instructions.md` with usage details and UI steps.

Why:
- Ensure that sensitive changes receive appropriate review and that CI checks run before merging.
- Provide an auditable script to apply branch protection via GitHub API.

What to review:
- `CODEOWNERS` entries (update team/user handles to match your org/team names).
- The branch-protection script payload: required status check contexts are: `Elixir CI`, `Redaction Unit Tests`, `Trivy Image Scan`.
  Ensure these names match the actual check run names in your GitHub Actions runs; adjust if necessary.

How to create the PR (locally):

1) Using GitHub CLI (recommended):
   gh pr create --base main --head feature/branch-protection-codeowners --title "chore: add CODEOWNERS and branch protection" --body-file .github/PULL_REQUESTS/0001-feature-branch-protection-codeowners.md

2) Or open via web: https://github.com/${GITHUB_OWNER:-73junito}/autolearnpro/pull/new/feature/branch-protection-codeowners

Applying branch protection (after merge / or run manually):

- Locally run the script to apply protection (requires admin PAT):
  GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=73junito GITHUB_REPO=autolearnpro ./scripts/set-branch-protection.sh

- Or use GitHub UI: Settings ? Branches ? Add branch protection rule for `main` and require the status checks listed above and require pull request reviews.

Notes:
- Update `CODEOWNERS` to replace `@security-team` and `@platform-team` with actual GitHub team slugs or usernames in your org.
- If the workflow check names differ from the contexts above, update the contexts in the script and re-run or adjust via GitHub UI.
