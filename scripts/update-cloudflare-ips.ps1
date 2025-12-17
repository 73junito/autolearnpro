# Update Cloudflare IPs in Nginx ConfigMap
# This script automates the process of updating Cloudflare IP ranges
# Usage: .\scripts\update-cloudflare-ips.ps1 [-DryRun] [-Namespace ingress-nginx]

param(
    [switch]$DryRun,
    [string]$Namespace = "ingress-nginx",
    [string]$ConfigMapName = "nginx-configuration"
)

$ErrorActionPreference = "Stop"

Write-Host "===== Cloudflare IP Update Script =====" -ForegroundColor Cyan
Write-Host "Namespace: $Namespace"
Write-Host "ConfigMap: $ConfigMapName"
Write-Host "Dry Run: $DryRun"
Write-Host ""

# Check kubectl availability
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Error "kubectl not found in PATH. Please install kubectl first."
    exit 1
}

# Verify cluster connection
Write-Host "Verifying cluster connection..." -ForegroundColor Yellow
try {
    kubectl cluster-info | Out-Null
    Write-Host "✓ Connected to cluster" -ForegroundColor Green
} catch {
    Write-Error "Cannot connect to cluster. Check your kubeconfig."
    exit 1
}

# Check if namespace exists
Write-Host "Checking namespace '$Namespace'..." -ForegroundColor Yellow
$nsExists = kubectl get namespace $Namespace 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Namespace '$Namespace' not found. Create it first or check ingress-nginx installation."
    exit 1
}
Write-Host "✓ Namespace exists" -ForegroundColor Green

# Backup existing ConfigMap
Write-Host "`nBacking up current ConfigMap..." -ForegroundColor Yellow
$backupFile = "nginx-configmap-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').yaml"
kubectl -n $Namespace get configmap $ConfigMapName -o yaml > $backupFile 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Backup saved to: $backupFile" -ForegroundColor Green
} else {
    Write-Warning "Could not backup ConfigMap (may not exist yet)"
}

# Fetch Cloudflare IP ranges
Write-Host "`nFetching Cloudflare IP ranges..." -ForegroundColor Yellow

try {
    $ipv4Url = "https://www.cloudflare.com/ips-v4"
    $ipv6Url = "https://www.cloudflare.com/ips-v6"
    
    $ipv4Ranges = (Invoke-WebRequest -Uri $ipv4Url -UseBasicParsing).Content.Trim() -split "`n"
    $ipv6Ranges = (Invoke-WebRequest -Uri $ipv6Url -UseBasicParsing).Content.Trim() -split "`n"
    
    $allRanges = $ipv4Ranges + $ipv6Ranges | Where-Object { $_ -ne "" }
    
    Write-Host "✓ Fetched $($ipv4Ranges.Count) IPv4 ranges" -ForegroundColor Green
    Write-Host "✓ Fetched $($ipv6Ranges.Count) IPv6 ranges" -ForegroundColor Green
    Write-Host "✓ Total: $($allRanges.Count) IP ranges" -ForegroundColor Green
} catch {
    Write-Error "Failed to fetch Cloudflare IP ranges: $_"
    exit 1
}

# Display fetched ranges
Write-Host "`nCloudflare IP Ranges:" -ForegroundColor Cyan
$allRanges | ForEach-Object { Write-Host "  $_" }

# Create ConfigMap patch
Write-Host "`nGenerating ConfigMap patch..." -ForegroundColor Yellow

$ipRangesIndented = ($allRanges | ForEach-Object { "    $_" }) -join "`n"

$configMapYaml = @"
apiVersion: v1
kind: ConfigMap
metadata:
  name: $ConfigMapName
  namespace: $Namespace
data:
  use-forwarded-headers: "true"
  real-ip-header: "CF-Connecting-IP"
  set-real-ip-from: |
$ipRangesIndented
"@

$patchFile = "nginx-cm-patch-$(Get-Date -Format 'yyyyMMdd-HHmmss').yaml"
$configMapYaml | Out-File -FilePath $patchFile -Encoding UTF8 -NoNewline

Write-Host "✓ ConfigMap patch saved to: $patchFile" -ForegroundColor Green

if ($DryRun) {
    Write-Host "`n===== DRY RUN MODE =====" -ForegroundColor Yellow
    Write-Host "ConfigMap that would be applied:"
    Write-Host $configMapYaml
    Write-Host "`nTo apply this configuration, run without -DryRun flag" -ForegroundColor Yellow
    exit 0
}

# Apply ConfigMap
Write-Host "`nApplying ConfigMap..." -ForegroundColor Yellow
kubectl apply -f $patchFile

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to apply ConfigMap"
    exit 1
}

Write-Host "✓ ConfigMap applied successfully" -ForegroundColor Green

# Restart ingress controller
Write-Host "`nRestarting ingress-nginx controller..." -ForegroundColor Yellow

$deployment = kubectl -n $Namespace get deployment -l app.kubernetes.io/component=controller -o name 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($deployment)) {
    # Try alternate label
    $deployment = kubectl -n $Namespace get deployment ingress-nginx-controller -o name 2>$null
}

if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrEmpty($deployment)) {
    kubectl -n $Namespace rollout restart $deployment
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Rollout restart initiated" -ForegroundColor Green
        Write-Host "  Waiting for rollout to complete..." -ForegroundColor Yellow
        kubectl -n $Namespace rollout status $deployment --timeout=180s
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Rollout completed successfully" -ForegroundColor Green
        } else {
            Write-Warning "Rollout status check timed out or failed"
        }
    } else {
        Write-Warning "Failed to restart deployment"
    }
} else {
    Write-Warning "Ingress controller deployment not found. Restart manually if needed:"
    Write-Host "  kubectl -n $Namespace rollout restart deployment/ingress-nginx-controller" -ForegroundColor Gray
}

# Verify ConfigMap
Write-Host "`nVerifying ConfigMap..." -ForegroundColor Yellow
kubectl -n $Namespace get configmap $ConfigMapName -o yaml | Select-String -Pattern "set-real-ip-from" -Context 0,5

Write-Host "`n===== Update Complete =====" -ForegroundColor Green
Write-Host "✓ Cloudflare IP ranges updated successfully"
Write-Host "✓ Backup saved: $backupFile"
Write-Host "✓ Patch file: $patchFile"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Verify ingress controller logs: kubectl -n $Namespace logs -l app.kubernetes.io/component=controller"
Write-Host "2. Test application access with Cloudflare headers"
Write-Host "3. Schedule this script to run monthly/weekly for IP range updates"
Write-Host ""
Write-Host "To schedule automatic updates, add this to your CI/CD or cron:" -ForegroundColor Yellow
Write-Host "  # GitHub Actions (weekly):"
Write-Host "  schedule: cron: '0 2 * * 1'  # Every Monday at 2 AM"
