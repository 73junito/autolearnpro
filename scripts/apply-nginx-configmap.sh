#!/usr/bin/env bash
# Apply the ingress-nginx ConfigMap for Cloudflare real-IP handling
# Usage:
#   KUBECONFIG=/path/to/kubeconfig ./scripts/apply-nginx-configmap.sh [--with-cloudflare]
# Options:
#   --with-cloudflare   : also fetch Cloudflare IPs and patch the ConfigMap (requires kubectl)

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
CONFIGMAP_MANIFEST="k8s/autolearnpro/nginx-configmap.yaml"

if [ ! -f "$CONFIGMAP_MANIFEST" ]; then
  echo "ERROR: ConfigMap manifest not found at $CONFIGMAP_MANIFEST" >&2
  exit 2
fi

echo "Applying ConfigMap manifest: $CONFIGMAP_MANIFEST"
kubectl apply -f "$CONFIGMAP_MANIFEST"

echo "ConfigMap applied."

if [ "${1:-}" = "--with-cloudflare" ]; then
  echo "Fetching Cloudflare IP ranges and patching ConfigMap (requires kubectl)..."
  chmod +x "$SCRIPT_DIR/fetch-and-patch-cloudflare-ips.sh" || true
  "$SCRIPT_DIR/fetch-and-patch-cloudflare-ips.sh" ingress-nginx nginx-configuration
  echo "Cloudflare IPs fetched and ConfigMap patched."
else
  echo "Note: run './scripts/fetch-and-patch-cloudflare-ips.sh' to populate Cloudflare IP ranges into the ConfigMap if you will be trusting CF headers."
fi

echo "Done. Verify with: kubectl -n ingress-nginx describe configmap nginx-configuration"