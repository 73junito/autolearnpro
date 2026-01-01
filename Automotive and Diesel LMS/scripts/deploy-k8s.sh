#!/usr/bin/env bash
# Deploy AutoLearnPro LMS to Kubernetes
# Usage: ./scripts/deploy-k8s.sh [--namespace autolearnpro] [--skip-namespace] [--skip-network-policy]

set -euo pipefail

# Default values
NAMESPACE="autolearnpro"
SKIP_NAMESPACE=false
SKIP_NETWORK_POLICY=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --skip-namespace)
      SKIP_NAMESPACE=true
      shift
      ;;
    --skip-network-policy)
      SKIP_NETWORK_POLICY=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--namespace autolearnpro] [--skip-namespace] [--skip-network-policy] [--dry-run]"
      exit 1
      ;;
  esac
done

KUBECTL_CMD="kubectl"
if [ "$DRY_RUN" = true ]; then
  KUBECTL_CMD="kubectl --dry-run=client"
  echo "🔍 DRY RUN MODE - No changes will be applied"
fi

echo "===== AutoLearnPro LMS Kubernetes Deployment ====="
echo "Namespace: $NAMESPACE"
echo ""

# Check kubectl
if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl not found. Please install kubectl first."
  exit 1
fi

# Check cluster connection
echo "🔍 Checking cluster connection..."
if ! kubectl cluster-info &> /dev/null; then
  echo "❌ Cannot connect to cluster. Check your kubeconfig."
  exit 1
fi
echo "✓ Connected to cluster"
echo ""

# Step 1: Create namespace (if not skipped)
if [ "$SKIP_NAMESPACE" = false ]; then
  echo "📦 Step 1: Creating namespace..."
  $KUBECTL_CMD apply -f k8s/autolearnpro/namespace.yaml
  echo "✓ Namespace ready"
else
  echo "⏭️  Skipping namespace creation"
fi
echo ""

# Step 2: Apply resource limits
echo "📊 Step 2: Applying resource quotas and limits..."
$KUBECTL_CMD apply -f k8s/autolearnpro/resource-limits.yaml
echo "✓ Resource limits configured"
echo ""

# Step 3: Check for secrets
echo "🔐 Step 3: Checking secrets..."
if kubectl -n "$NAMESPACE" get secret lms-api-secrets &> /dev/null; then
  echo "✓ Secret 'lms-api-secrets' exists"
else
  echo "⚠️  WARNING: Secret 'lms-api-secrets' not found!"
  echo "   Create it before proceeding:"
  echo ""
  echo "   kubectl -n $NAMESPACE create secret generic lms-api-secrets \\"
  echo "     --from-literal=DATABASE_URL='postgresql://user:pass@postgres:5432/lms_api_prod' \\"
  echo "     --from-literal=SECRET_KEY_BASE='<generate-secret>' \\"
  echo "     --from-literal=GUARDIAN_SECRET_KEY='<generate-secret>'"
  echo ""
  
  if [ "$DRY_RUN" = false ]; then
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
fi
echo ""

# Step 4: Deploy application
echo "🚀 Step 4: Deploying application..."
$KUBECTL_CMD apply -f k8s/autolearnpro/deployment.yaml
echo "✓ Deployment created"
echo ""

# Step 5: Create service
echo "🔌 Step 5: Creating service..."
$KUBECTL_CMD apply -f k8s/autolearnpro/service.yaml
echo "✓ Service created"
echo ""

# Step 6: Apply HPA
echo "📈 Step 6: Configuring autoscaling..."
$KUBECTL_CMD apply -f k8s/autolearnpro/hpa.yaml
echo "✓ HPA configured"
echo ""

# Step 7: Apply PDB
echo "🛡️  Step 7: Configuring pod disruption budget..."
$KUBECTL_CMD apply -f k8s/autolearnpro/pdb.yaml
echo "✓ PDB configured"
echo ""

# Step 8: Apply network policy (if not skipped)
if [ "$SKIP_NETWORK_POLICY" = false ]; then
  echo "🔒 Step 8: Applying network policies..."
  $KUBECTL_CMD apply -f k8s/autolearnpro/networkpolicy.yaml
  echo "✓ Network policies applied"
else
  echo "⏭️  Skipping network policy"
fi
echo ""

# Step 9: Check ClusterIssuer
echo "🔐 Step 9: Checking TLS configuration..."
if kubectl get clusterissuer letsencrypt-prod &> /dev/null; then
  echo "✓ ClusterIssuer 'letsencrypt-prod' exists"
else
  echo "⚠️  WARNING: ClusterIssuer 'letsencrypt-prod' not found!"
  echo "   Apply it for TLS automation:"
  echo "   kubectl apply -f k8s/autolearnpro/clusterissuer.yaml"
  echo ""
fi
echo ""

# Step 10: Deploy ingress
echo "🌐 Step 10: Configuring ingress..."
echo "⚠️  NOTE: Update domain in k8s/autolearnpro/ingress.yaml before applying!"
read -p "Have you updated the domain in ingress.yaml? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [ "$DRY_RUN" = true ]; then
  $KUBECTL_CMD apply -f k8s/autolearnpro/ingress.yaml
  echo "✓ Ingress configured"
else
  echo "⏭️  Skipping ingress - apply manually after updating domain"
fi
echo ""

# Wait for rollout (if not dry run)
if [ "$DRY_RUN" = false ]; then
  echo "⏳ Waiting for deployment rollout..."
  if kubectl -n "$NAMESPACE" rollout status deployment/lms-api --timeout=300s; then
    echo "✓ Deployment rollout complete"
  else
    echo "⚠️  Rollout timed out or failed"
    echo "   Check status: kubectl -n $NAMESPACE get pods"
  fi
  echo ""
fi

# Display status
echo "===== Deployment Status ====="
if [ "$DRY_RUN" = false ]; then
  echo ""
  echo "Deployments:"
  kubectl -n "$NAMESPACE" get deployments
  
  echo ""
  echo "Pods:"
  kubectl -n "$NAMESPACE" get pods -o wide
  
  echo ""
  echo "Services:"
  kubectl -n "$NAMESPACE" get services
  
  echo ""
  echo "HPA:"
  kubectl -n "$NAMESPACE" get hpa
  
  echo ""
  echo "Ingress:"
  kubectl -n "$NAMESPACE" get ingress
  
  if kubectl -n "$NAMESPACE" get certificate &> /dev/null; then
    echo ""
    echo "Certificates:"
    kubectl -n "$NAMESPACE" get certificate
  fi
fi
echo ""

# Next steps
echo "===== Next Steps ====="
echo ""
echo "1. 🔐 Apply ClusterIssuer (if not done):"
echo "   kubectl apply -f k8s/autolearnpro/clusterissuer.yaml"
echo ""
echo "2. 🌐 Update Cloudflare IP ranges in nginx:"
echo "   ./scripts/fetch-and-patch-cloudflare-ips.sh"
echo ""
echo "3. 🧪 Run smoke test:"
echo "   kubectl -n $NAMESPACE apply -f k8s/autolearnpro/09-smoke-test-idempotent.yaml"
echo "   kubectl -n $NAMESPACE wait --for=condition=complete job/smoke-test-idempotent --timeout=120s"
echo "   kubectl -n $NAMESPACE logs -l job-name=smoke-test-idempotent"
echo ""
echo "4. 🔍 Run service tests:"
echo "   ./scripts/test-services.sh $NAMESPACE"
echo ""
echo "5. 📊 Monitor deployment:"
echo "   kubectl -n $NAMESPACE get pods -w"
echo "   kubectl -n $NAMESPACE logs -l app=lms-api -f"
echo ""
echo "✅ Deployment script complete!"
