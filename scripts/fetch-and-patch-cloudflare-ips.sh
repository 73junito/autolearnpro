#!/usr/bin/env bash
# Fetch Cloudflare IP ranges and patch the ingress-nginx ConfigMap 'nginx-configuration'
# Usage: ./scripts/fetch-and-patch-cloudflare-ips.sh

set -euo pipefail

NAMESPACE=${1:-ingress-nginx}
CONFIGMAP_NAME=${2:-nginx-configuration}
TMPFILE=$(mktemp)

echo "Fetching Cloudflare IPv4 and IPv6 ranges..."
curl -sS https://www.cloudflare.com/ips-v4 > "$TMPFILE.v4"
curl -sS https://www.cloudflare.com/ips-v6 > "$TMPFILE.v6"

cat "$TMPFILE.v4" "$TMPFILE.v6" > "$TMPFILE"

# Generate YAML block for set-real-ip-from
REAL_IPS=$(awk '{print $0"\n"}' "$TMPFILE" | sed 's/$/\n/')

# Create a patch ConfigMap YAML and apply via kubectl
cat <<EOF > /tmp/nginx-cm-patch.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${CONFIGMAP_NAME}
  namespace: ${NAMESPACE}
data:
  set-real-ip-from: |-
$(sed 's/^/    /' "$TMPFILE")
EOF

echo "Applying ConfigMap patch to $NAMESPACE/$CONFIGMAP_NAME..."
kubectl apply -f /tmp/nginx-cm-patch.yaml

echo "Restarting ingress-nginx controller deployment to pick up changes..."
kubectl -n ${NAMESPACE} rollout restart deployment ingress-nginx-controller || echo "restart failed or deployment name differs; restart manually"

rm -f "$TMPFILE" "$TMPFILE.v4" "$TMPFILE.v6" /tmp/nginx-cm-patch.yaml

echo "Done. ConfigMap updated with Cloudflare IP ranges."