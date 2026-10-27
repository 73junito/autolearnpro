# Manual AI-assisted GitHub Actions pilot

This repository workflow is an advisory, manually triggered metadata review. It is **not Cline remote execution**, a coding agent, a security scanner, or an automated pull-request author.

## Setup
1. Merge this change only after reviewing the draft PR.
2. In **Settings → Secrets and variables → Actions**, add a repository secret named `CLINE_DEVELOPMENT_KEY`. Use a development-scoped key only; never add `CLINE_STAGING_KEY` or `CLINE_PRODUCTION_KEY` for this pilot, and never commit or paste a key value into a workflow or conversation.
3. Optionally define repository variable `AI_REVIEW_MODEL` (default `anthropic/claude-sonnet-4-6`). Slash-delimited provider/model identifiers are accepted, for example `openai/gpt-4.1-mini`; any other model must be reachable through the Cline API.
4. Open **Actions → AI Repository Review (Manual, Read-only) → Run workflow**, choose the focus, and inspect the `ai-readonly-review` artifact.

## API request
- Endpoint: `https://api.cline.bot/api/v1/chat/completions` (OpenAI-compatible chat completions), authenticated with `Authorization: Bearer $CLINE_DEVELOPMENT_KEY`.
- Body: `model`, a `messages` array (one `system` message plus one `user` message carrying the untrusted metadata), `max_tokens: 1200`, and `stream: false`. No tools, function calling, or code execution are requested.
- The review text is read from `choices[0].message.content`; an empty or malformed response fails the run without producing a report.

## Safeguards
- `workflow_dispatch` only; no automatic PR execution, untrusted fork triggers, scheduled costs, or agent write permissions.
- `GITHUB_TOKEN` limited to `contents: read`; checkout credentials are not persisted.
- Source input is limited to README excerpt and root filenames, explicitly treated as untrusted.
- Only the development-scoped `CLINE_DEVELOPMENT_KEY` is referenced; `CLINE_STAGING_KEY` and `CLINE_PRODUCTION_KEY` are never read by the workflow or script.
- The request is a single stateless chat-completions call with no tools or streaming; the specified repository metadata is transmitted to the Cline API and its underlying model provider.
- Report is a short-lived artifact (7 days); no issue, PR, push, merge, migration or production deploy.
- Model recommendations are not verified facts. Human review and Stage 2 acceptance stay mandatory.

## Operational limits
GitHub's default branch currently has minimal content; results are correspondingly limited. The local Cline Stage 2 working tree is *not* uploaded. Missing or invalid API keys cause a failed run with no report. API usage may incur cost.
