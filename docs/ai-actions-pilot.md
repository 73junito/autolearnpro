# Manual AI-assisted GitHub Actions pilot

This repository workflow is an advisory, manually triggered metadata review. It is **not Cline remote execution**, a coding agent, a security scanner, or an automated pull-request author.

## Setup
1. Merge this change only after reviewing the draft PR.
2. In **Settings → Secrets and variables → Actions**, add a repository secret named `CLINE_DEVELOPMENT_KEY`. Use a development-scoped key only; never add `CLINE_STAGING_KEY` or `CLINE_PRODUCTION_KEY` for this pilot, and never commit or paste a key value into a workflow or conversation.
3. Optionally define repository variable `AI_REVIEW_MODEL` (default `cline-pass/qwen3.7-plus`). Identifiers use the `provider/model` form from the live catalog at `https://api.cline.bot/api/v1/models`, for example `cline-pass/qwen3.7-plus`; aliases such as `~anthropic/claude-sonnet-latest` and `:free` suffixes are accepted too.
4. Open **Actions → AI Repository Review (Manual, Read-only) → Run workflow**, choose the focus, and inspect the `ai-readonly-review` artifact.

## API request
- Endpoint: `https://api.cline.bot/api/v1/chat/completions` (OpenAI-compatible chat completions), authenticated with `Authorization: Bearer $CLINE_DEVELOPMENT_KEY`.
- Body: `model`, a `messages` array (one `system` message plus one `user` message carrying the untrusted metadata), `max_tokens: 1200`, and `stream: false`. No tools, function calling, or code execution are requested.
- The review text is read from `choices[0].message.content`; an empty or malformed response fails the run without producing a report.
- On an HTTP failure the run logs the status, the model id, a sanitized provider error code/message (truncated to 200 characters), and a hint. Raw response bodies and credentials are never printed. The same message is emitted as a GitHub Actions `::error::` annotation, so it appears in the run summary without opening the step log.

## Safe response diagnostics
When the HTTP request succeeds but the response does not contain usable text, the reviewer emits a GitHub Actions error annotation describing only the structural failure: missing or non-array `choices`, empty choices, missing `message`, or missing/empty non-text `content`. It does not log response bodies, generated text, prompt contents, API keys, response metadata values, or arbitrary provider-supplied field names. These annotations help distinguish incompatible response formats without exposing data.

## Troubleshooting
- `HTTP 404 - model not found`: the model id is not in the live catalog. Model ids must match the catalog exactly; the old default `anthropic/claude-sonnet-4-6` returned 404. Confirm the id with `curl -s https://api.cline.bot/api/v1/models` before changing the workflow variable.
- `HTTP 402`: check whether the API key is associated with the active ClinePass subscription and whether subscription quota is available. For pay-as-you-go models, insufficient credits requires adding credits; this is not necessarily required for eligible `cline-pass/` models.
- `HTTP 401`: the key is invalid or revoked; rotate `CLINE_DEVELOPMENT_KEY`.
- `HTTP 429`/`5xx`: transient; rerun the workflow later.

## Safeguards
- `workflow_dispatch` only; no automatic PR execution, untrusted fork triggers, scheduled costs, or agent write permissions.
- `GITHUB_TOKEN` limited to `contents: read`; checkout credentials are not persisted.
- Source input is limited to README excerpt and root filenames, explicitly treated as untrusted.
- Only the development-scoped `CLINE_DEVELOPMENT_KEY` is referenced; `CLINE_STAGING_KEY` and `CLINE_PRODUCTION_KEY` are never read by the workflow or script.
- The request is a single stateless chat-completions call with no tools or streaming; the specified repository metadata is transmitted to the Cline API and its underlying model provider.
- Report is a short-lived artifact (7 days); no issue, PR, push, merge, migration or production deploy.
- Actions are pinned to Node.js 24 runtimes (`actions/checkout@v5`, `actions/upload-artifact@v6`) with a 7-day artifact retention.
- Model recommendations are not verified facts. Human review and Stage 2 acceptance stay mandatory.

## Operational limits
GitHub's default branch currently has minimal content; results are correspondingly limited. The local Cline Stage 2 working tree is *not* uploaded. Missing or invalid API keys cause a failed run with no report. ClinePass models use subscription quota when the API key is eligible. Verify actual entitlement in the first live run; using another model may incur credit charges.
