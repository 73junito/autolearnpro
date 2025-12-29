#!/usr/bin/env bash
# Test basic service connectivity for the autolearnpro cluster namespace
# Usage: KUBECONFIG=path/to/kubeconfig ./scripts/test-services.sh
# Or run in CI where KUBECONFIG is set via secret

set -euo pipefail

NAMESPACE=${1:-autolearnpro}
TIMEOUT=${2:-120}

echo "Testing services in namespace: $NAMESPACE"

# Check kubectl available
if ! command -v kubectl >/dev/null 2>&1; then
  echo "ERROR: kubectl not found in PATH"
  exit 2
fi

# Check namespace exists
if ! kubectl get ns "$NAMESPACE" >/dev/null 2>&1; then
  echo "ERROR: namespace $NAMESPACE not found"
  exit 3
fi

# Check deployments
echo "Checking deployments..."
kubectl -n "$NAMESPACE" get deploy -o wide || true

# Check rollout status for lms-api
if kubectl -n "$NAMESPACE" get deployment lms-api >/dev/null 2>&1; then
  echo "Waiting for lms-api rollout status (timeout ${TIMEOUT}s)..."
  if ! kubectl -n "$NAMESPACE" rollout status deployment/lms-api --timeout=${TIMEOUT}s; then
    echo "ERROR: lms-api rollout not complete or failed"
    kubectl -n "$NAMESPACE" get pods -o wide
    exit 4
  fi
else
  echo "WARNING: deployment lms-api not found in $NAMESPACE"
fi

# List pods and their statuses
echo "Pods in $NAMESPACE:" 
kubectl -n "$NAMESPACE" get pods -o wide

# Try to port-forward lms-api to localhost and curl /api/health
if kubectl -n "$NAMESPACE" get deployment lms-api >/dev/null 2>&1; then
  echo "Attempting port-forward to lms-api on localhost:4000"
  kubectl -n "$NAMESPACE" port-forward deployment/lms-api 4000:4000 >/tmp/port-forward.log 2>&1 &
  PF_PID=$!
  echo "Port-forward pid: $PF_PID"

  # wait for local port to be open
  START=$(date +%s)
  while ! nc -z localhost 4000 >/dev/null 2>&1; do
    sleep 1
    if [ $(( $(date +%s) - START )) -gt 30 ]; then
      echo "ERROR: port-forward did not open localhost:4000 within 30s"
      cat /tmp/port-forward.log || true
      kill $PF_PID 2>/dev/null || true
      exit 5
    fi
  done

  echo "Calling health endpoint..."
  if ! curl -fsS --max-time 10 http://localhost:4000/api/health -w "\nHTTP_STATUS:%{http_code}\n" -o /tmp/health.json; then
    echo "ERROR: health endpoint request failed"
    cat /tmp/port-forward.log || true
    kill $PF_PID 2>/dev/null || true
    exit 6
  fi

  echo "Health response:" && cat /tmp/health.json

  # cleanup
  kill $PF_PID 2>/dev/null || true
  rm -f /tmp/port-forward.log /tmp/health.json || true
else
  echo "Skipping health check: lms-api deployment not found"
fi

# Check for postgres service/pod
if kubectl -n "$NAMESPACE" get svc postgres >/dev/null 2>&1 || kubectl -n "$NAMESPACE" get pods -l app=postgres >/dev/null 2>&1; then
  echo "Postgres detected — checking readiness (pg_isready via pod if available)"
  POD=$(kubectl -n "$NAMESPACE" get pods -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
  if [ -n "$POD" ]; then
    echo "Running pg_isready inside pod $POD"
    kubectl -n "$NAMESPACE" exec "$POD" -- pg_isready || echo "pg_isready returned non-zero" 
  else
    echo "No postgres pod found; skipping detailed DB checks"
  fi
else
  echo "No Postgres service/pod detected in $NAMESPACE"
fi

# Check ingress if exists
if kubectl -n "$NAMESPACE" get ingress >/dev/null 2>&1; then
  echo "Ingresses in $NAMESPACE:"
  kubectl -n "$NAMESPACE" get ingress -o wide
else
  echo "No ingress resources in $NAMESPACE"
fi

echo "Service connectivity checks completed."
exit 0
