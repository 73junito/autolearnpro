Branch protection setup

Use the included script `scripts/set-branch-protection.sh` to enable branch protection on `main`.

Prerequisites
- `GITHUB_TOKEN` with admin:repo_hook and repo permissions
- `GITHUB_OWNER` and `GITHUB_REPO` environment variables set
- `jq` installed for JSON output

Example usage:

GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=73junito GITHUB_REPO=autolearnpro ./scripts/set-branch-protection.sh

The script will set required status checks (Elixir CI, Redaction Unit Tests, Trivy Image Scan), require an approving review, and enforce for admins.

If you prefer to configure via the GitHub UI:
- Settings ? Branches ? Branch protection rules ? Add rule for `main`
- Require status checks to pass and add the workflows above
- Require pull request reviews and set approvals to 1
- Enforce for administrators (optional)
