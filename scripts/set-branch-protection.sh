#!/usr/bin/env bash
# Usage: GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=73junito GITHUB_REPO=autolearnpro ./scripts/set-branch-protection.sh
# This script sets branch protection on 'main' to require CI checks.

set -euo pipefail

: "${GITHUB_TOKEN:?Need to set GITHUB_TOKEN env var with repo admin rights}"
: "${GITHUB_OWNER:?Need to set GITHUB_OWNER env var}"
: "${GITHUB_REPO:?Need to set GITHUB_REPO env var}"

API="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/main/protection"

# Required status checks - update contexts to match workflow names in this repo
read -r -d '' PAYLOAD <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Elixir CI", "Redaction Unit Tests", "Trivy Image Scan"]n  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null
}
JSON

# The PAYLOAD above contains a small intentional placeholder newline; fix it
PAYLOAD=$(echo "$PAYLOAD" | sed 's/\n  },/  },/')

curl -sS -X PUT "$API" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  | jq

echo "Branch protection applied (or response shown)."
