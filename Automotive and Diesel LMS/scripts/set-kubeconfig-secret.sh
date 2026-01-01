#!/usr/bin/env bash
# Usage: ./scripts/set-kubeconfig-secret.sh /path/to/kubeconfig [repo]
# Sets the KUBECONFIG_DATA repository secret (base64-encoded kubeconfig) using `gh` CLI.

set -euo pipefail

KUBECONFIG_PATH=${1:-}
REPO=${2:-73junito/autolearnpro}

if [ -z "$KUBECONFIG_PATH" ]; then
  echo "Usage: $0 /path/to/kubeconfig [repo]"
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found. Install GitHub CLI and authenticate (gh auth login)." >&2
  exit 3
fi

if [ ! -f "$KUBECONFIG_PATH" ]; then
  echo "ERROR: kubeconfig file not found: $KUBECONFIG_PATH" >&2
  exit 4
fi

# Base64 encode without line breaks (portable across platforms)
if command -v base64 >/dev/null 2>&1; then
  # GNU/OpenSSL base64
  KUBECONFIG_B64=$(base64 -w0 "$KUBECONFIG_PATH")
else
  # macOS base64
  KUBECONFIG_B64=$(base64 "$KUBECONFIG_PATH" | tr -d '\n')
fi

echo "Setting secret KUBECONFIG_DATA on repo $REPO..."
# Use gh to set the secret (gh will encrypt using repo's public key)
printf '%s' "$KUBECONFIG_B64" | gh secret set KUBECONFIG_DATA --repo "$REPO" --body -

echo "Secret set. Verify in GitHub -> Settings -> Secrets -> Actions."