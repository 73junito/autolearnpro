# Manual AI-assisted GitHub Actions pilot

This repository workflow is an advisory, manually triggered metadata review. It is **not Cline remote execution**, a coding agent, a security scanner, or an automated pull-request author.

## Setup
1. Merge this change only after reviewing the draft PR.
2. In **Settings → Secrets and variables → Actions**, add a repository secret named `OPENAI_API_KEY`. Never commit or paste its value into a workflow or conversation.
3. Optionally define repository variable `AI_REVIEW_MODEL` (default `gpt-4.1-mini`); use a model available to the API project.
4. Open **Actions → AI Repository Review (Manual, Read-only) → Run workflow**, choose the focus, and inspect the `ai-readonly-review` artifact.

## Safeguards
- `workflow_dispatch` only; no automatic PR execution, untrusted fork triggers, scheduled costs, or agent write permissions.
- `GITHUB_TOKEN` limited to `contents: read`; checkout credentials are not persisted.
- Source input is limited to README excerpt and root filenames, explicitly treated as untrusted.
- API request uses `store: false`; a third-party model API call transmits the specified repository metadata.
- Report is a short-lived artifact (7 days); no issue, PR, push, merge, migration or production deploy.
- Model recommendations are not verified facts. Human review and Stage 2 acceptance stay mandatory.

## Operational limits
GitHub's default branch currently has minimal content; results are correspondingly limited. The local Cline Stage 2 working tree is *not* uploaded. Missing or invalid API keys cause a failed run with no report. API usage may incur cost.
