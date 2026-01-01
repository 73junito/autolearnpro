# Deploy AutoLearnPro LMS to Kubernetes (PowerShell version)
# Usage: .\scripts\deploy-k8s.ps1 [-Namespace autolearnpro] [-SkipNamespace] [-SkipNetworkPolicy] [-DryRun]

param(
    [string]$Namespace = "autolearnpro",
    [switch]$SkipNamespace,
    [switch]$SkipNetworkPolicy,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "===== AutoLearnPro LMS Kubernetes Deployment =====" -ForegroundColor Cyan
Write-Host "Namespace: $Namespace"
if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be applied" -ForegroundColor Yellow
}
Write-Host ""

# Check kubectl
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Error "kubectl not found. Please install kubectl first."
    exit 1
}

# Check cluster connection
Write-Host "🔍 Checking cluster connection..." -ForegroundColor Yellow
try {
    kubectl cluster-info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Host "✓ Connected to cluster" -ForegroundColor Green
} catch {
    Write-Error "Cannot connect to cluster. Check your kubeconfig."
    exit 1
}
Write-Host ""

$kubectlArgs = @()
if ($DryRun) {
    $kubectlArgs += "--dry-run=client"
}

# Step 1: Create namespace
if (-not $SkipNamespace) {
    Write-Host "📦 Step 1: Creating namespace..." -ForegroundColor Yellow
    kubectl apply -f k8s\autolearnpro\namespace.yaml @kubectlArgs
    Write-Host "✓ Namespace ready" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping namespace creation" -ForegroundColor Gray
}
Write-Host ""

# Step 2: Apply resource limits
Write-Host "📊 Step 2: Applying resource quotas and limits..." -ForegroundColor Yellow
kubectl apply -f k8s\autolearnpro\resource-limits.yaml @kubectlArgs
Write-Host "✓ Resource limits configured" -ForegroundColor Green
Write-Host ""

# Step 3: Check secrets
Write-Host "🔐 Step 3: Checking secrets..." -ForegroundColor Yellow
$secretExists = kubectl -n $Namespace get secret lms-api-secrets 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Secret 'lms-api-secrets' exists" -ForegroundColor Green
} else {
    Write-Warning "Secret 'lms-api-secrets' not found!"
    Write-Host "Create it before proceeding:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "kubectl -n $Namespace create secret generic lms-api-secrets \"
    Write-Host "  --from-literal=DATABASE_URL='postgresql://user:pass@postgres:5432/lms_api_prod' \"
    Write-Host "  --from-literal=SECRET_KEY_BASE='<generate-secret>' \"
    Write-Host "  --from-literal=GUARDIAN_SECRET_KEY='<generate-secret>'"
    Write-Host ""
    
    if (-not $DryRun) {
        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            exit 1
        }
    }
}
Write-Host ""

# Step 4: Deploy application
Write-Host "🚀 Step 4: Deploying application..." -ForegroundColor Yellow
kubectl apply -f k8s\autolearnpro\deployment.yaml @kubectlArgs
Write-Host "✓ Deployment created" -ForegroundColor Green
Write-Host ""

# Step 5: Create service
Write-Host "🔌 Step 5: Creating service..." -ForegroundColor Yellow
kubectl apply -f k8s\autolearnpro\service.yaml @kubectlArgs
Write-Host "✓ Service created" -ForegroundColor Green
Write-Host ""

# Step 6: Apply HPA
Write-Host "📈 Step 6: Configuring autoscaling..." -ForegroundColor Yellow
kubectl apply -f k8s\autolearnpro\hpa.yaml @kubectlArgs
Write-Host "✓ HPA configured" -ForegroundColor Green
Write-Host ""

# Step 7: Apply PDB
Write-Host "🛡️  Step 7: Configuring pod disruption budget..." -ForegroundColor Yellow
kubectl apply -f k8s\autolearnpro\pdb.yaml @kubectlArgs
Write-Host "✓ PDB configured" -ForegroundColor Green
Write-Host ""

# Step 8: Apply network policy
if (-not $SkipNetworkPolicy) {
    Write-Host "🔒 Step 8: Applying network policies..." -ForegroundColor Yellow
    kubectl apply -f k8s\autolearnpro\networkpolicy.yaml @kubectlArgs
    Write-Host "✓ Network policies applied" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping network policy" -ForegroundColor Gray
}
Write-Host ""

# Step 9: Check ClusterIssuer
Write-Host "🔐 Step 9: Checking TLS configuration..." -ForegroundColor Yellow
$issuerExists = kubectl get clusterissuer letsencrypt-prod 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ ClusterIssuer 'letsencrypt-prod' exists" -ForegroundColor Green
} else {
    Write-Warning "ClusterIssuer 'letsencrypt-prod' not found!"
    Write-Host "Apply it for TLS automation:" -ForegroundColor Yellow
    Write-Host "kubectl apply -f k8s\autolearnpro\clusterissuer.yaml"
}
Write-Host ""

# Step 10: Deploy ingress
Write-Host "🌐 Step 10: Configuring ingress..." -ForegroundColor Yellow
Write-Warning "NOTE: Update domain in k8s\autolearnpro\ingress.yaml before applying!"
$applyIngress = Read-Host "Have you updated the domain in ingress.yaml? (y/N)"
if ($applyIngress -eq "y" -or $applyIngress -eq "Y" -or $DryRun) {
    kubectl apply -f k8s\autolearnpro\ingress.yaml @kubectlArgs
    Write-Host "✓ Ingress configured" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping ingress - apply manually after updating domain" -ForegroundColor Gray
}
Write-Host ""

# Wait for rollout
if (-not $DryRun) {
    Write-Host "⏳ Waiting for deployment rollout..." -ForegroundColor Yellow
    kubectl -n $Namespace rollout status deployment/lms-api --timeout=300s
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Deployment rollout complete" -ForegroundColor Green
    } else {
        Write-Warning "Rollout timed out or failed"
        Write-Host "Check status: kubectl -n $Namespace get pods" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Display status
Write-Host "===== Deployment Status =====" -ForegroundColor Cyan
if (-not $DryRun) {
    Write-Host ""
    Write-Host "Deployments:" -ForegroundColor Yellow
    kubectl -n $Namespace get deployments
    
    Write-Host ""
    Write-Host "Pods:" -ForegroundColor Yellow
    kubectl -n $Namespace get pods -o wide
    
    Write-Host ""
    Write-Host "Services:" -ForegroundColor Yellow
    kubectl -n $Namespace get services
    
    Write-Host ""
    Write-Host "HPA:" -ForegroundColor Yellow
    kubectl -n $Namespace get hpa
    
    Write-Host ""
    Write-Host "Ingress:" -ForegroundColor Yellow
    kubectl -n $Namespace get ingress
    
    $certExists = kubectl -n $Namespace get certificate 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Certificates:" -ForegroundColor Yellow
        kubectl -n $Namespace get certificate
    }
}
Write-Host ""

# Next steps
Write-Host "===== Next Steps =====" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. 🔐 Apply ClusterIssuer (if not done):" -ForegroundColor Yellow
Write-Host "   kubectl apply -f k8s\autolearnpro\clusterissuer.yaml"
Write-Host ""
Write-Host "2. 🌐 Update Cloudflare IP ranges in nginx:" -ForegroundColor Yellow
Write-Host "   .\scripts\update-cloudflare-ips.ps1"
Write-Host "   # or bash: ./scripts/fetch-and-patch-cloudflare-ips.sh"
Write-Host ""
Write-Host "3. 🧪 Run smoke test:" -ForegroundColor Yellow
Write-Host "   kubectl -n $Namespace apply -f k8s\autolearnpro\09-smoke-test-idempotent.yaml"
Write-Host "   kubectl -n $Namespace wait --for=condition=complete job/smoke-test-idempotent --timeout=120s"
Write-Host "   kubectl -n $Namespace logs -l job-name=smoke-test-idempotent"
Write-Host ""
Write-Host "4. 🔍 Run service tests:" -ForegroundColor Yellow
Write-Host "   .\scripts\test-services.sh $Namespace  # bash required"
Write-Host ""
Write-Host "5. 📊 Monitor deployment:" -ForegroundColor Yellow
Write-Host "   kubectl -n $Namespace get pods -w"
Write-Host "   kubectl -n $Namespace logs -l app=lms-api -f"
Write-Host ""
Write-Host "✅ Deployment script complete!" -ForegroundColor Green
