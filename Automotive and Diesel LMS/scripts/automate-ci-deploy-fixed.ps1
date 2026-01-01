<#
Automate CI -> Publish -> Deploy -> Smoke Test

Usage:
  .\automate-ci-deploy-fixed.ps1 -GitHubToken <PAT> [-RepoOwner 73junito] [-Repo autolearnpro] [-Workflow publish-image.yml] [-Branch k8s/env-from-health] [-ImageTag latest]

This script will:
  - Trigger the GitHub Actions workflow by workflow file name using the provided PAT
  - Poll the workflow run until it completes
  - If successful, update the Kubernetes deployment image to the GHCR image (ghcr.io/<owner>/lms-api:<ImageTag>)
  - Wait for rollout and run the idempotent smoke test job

Note: Requires `kubectl` available in PATH and access to the cluster.
#>

param(
    [Parameter(Mandatory=$false)][string]$GitHubToken,
    [string]$RepoOwner = '73junito',
    [string]$Repo = 'autolearnpro',
    [string]$Workflow = 'publish-image.yml',
    [string]$Branch = 'k8s/env-from-health',
    [string]$ImageTag = 'latest',
    [string]$Image = '',
    [string]$KubeNamespace = 'autolearnpro',
    [string]$SmokeJobManifest = 'd:\\Automotive and Diesel LMS\\k8s\\autolearnpro\\09-smoke-test-idempotent.yaml',
    [int]$PollIntervalSeconds = 10,
    [int]$TimeoutMinutes = 30
)

function Throw-IfLastExitFail($message){
    if ($LASTEXITCODE -ne 0) { throw "$message (exit $LASTEXITCODE)" }
}

if (-not $GitHubToken) {
    Write-Host "No GitHub token provided. Prompting for a GitHub PAT to dispatch workflow..."
    $secure = Read-Host -AsSecureString "Enter GitHub PAT (required to dispatch workflow)"
    if ($secure) {
        $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        $GitHubToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    } else {
        Write-Host "No PAT entered. The script will continue but will not dispatch a workflow."
    }
}

$headers = @{}
if ($GitHubToken) {
    $headers = @{ Authorization = "Bearer $GitHubToken"; Accept = 'application/vnd.github+json' }
}

$workflowDispatchUrl = "https://api.github.com/repos/$RepoOwner/$Repo/actions/workflows/$Workflow/dispatches"

if ($GitHubToken) {
    Write-Host "Triggering workflow $Workflow on branch $Branch..."
    $body = @{ ref = $Branch } | ConvertTo-Json
    try {
        Invoke-RestMethod -Method Post -Uri $workflowDispatchUrl -Headers $headers -Body $body -ErrorAction Stop
    } catch {
        Write-Error "Failed to dispatch workflow: $_"
        exit 2
    }
    Write-Host "Workflow dispatch requested. Waiting for run to appear..."

    # Poll for run
    $runsUrl = "https://api.github.com/repos/$RepoOwner/$Repo/actions/workflows/$Workflow/runs?branch=$Branch"
    $start = Get-Date
    $runId = $null
    while (((Get-Date) - $start).TotalMinutes -lt $TimeoutMinutes) {
        Start-Sleep -Seconds $PollIntervalSeconds
        try{
            $resp = Invoke-RestMethod -Method Get -Uri $runsUrl -Headers $headers -ErrorAction Stop
        } catch {
            Write-Warning "Failed to fetch workflow runs: $_"
            continue
        }
        if ($resp.total_count -gt 0) {
            # pick the most recent run
            $run = $resp.workflow_runs | Sort-Object created_at -Descending | Select-Object -First 1
            if ($run.head_branch -eq $Branch) {
                $runId = $run.id
                Write-Host "Found run id $runId (status: $($run.status), conclusion: $($run.conclusion))"
                break
            }
        }
    }
    if (-not $runId) { Write-Error "Timed out waiting for workflow run to appear."; exit 3 }

    # Poll until completed
    $runUrl = "https://api.github.com/repos/$RepoOwner/$Repo/actions/runs/$runId"
    while (((Get-Date) - $start).TotalMinutes -lt $TimeoutMinutes) {
        Start-Sleep -Seconds $PollIntervalSeconds
        $run = Invoke-RestMethod -Method Get -Uri $runUrl -Headers $headers
        Write-Host "Run status: $($run.status) - conclusion: $($run.conclusion)"
        if ($run.status -eq 'completed') { break }
    }
    if ($run.status -ne 'completed') { Write-Error "Workflow run did not complete within timeout."; exit 4 }
    if ($run.conclusion -ne 'success') { Write-Error "Workflow run finished but conclusion is '$($run.conclusion)'. Check Actions logs."; exit 5 }
    Write-Host "Workflow run succeeded. Proceeding to deploy image ghcr.io/$RepoOwner/lms-api:$ImageTag"
}

# Deploy to cluster
# Allow passing a full image string via -Image; otherwise construct GHCR image from owner + tag
if ([string]::IsNullOrEmpty($Image)) {
    $image = "ghcr.io/$RepoOwner/lms-api:$ImageTag"
} else {
    $image = $Image
}
Write-Host "Updating deployment lms-api to image $image in namespace $KubeNamespace"
kubectl -n $KubeNamespace set image deployment/lms-api lms-api=$image
Throw-IfLastExitFail "kubectl set image failed"
kubectl -n $KubeNamespace rollout status deployment/lms-api --timeout=120s
Throw-IfLastExitFail "rollout failed or timed out"

# Run smoke test job
Write-Host "Re-running idempotent smoke test job"
kubectl -n $KubeNamespace delete job smoke-test-idempotent --ignore-not-found
kubectl -n $KubeNamespace apply -f "$SmokeJobManifest"
Throw-IfLastExitFail "Failed to create smoke-test job"
kubectl -n $KubeNamespace wait --for=condition=complete job/smoke-test-idempotent --timeout=120s
if ($LASTEXITCODE -ne 0) { Write-Warning 'Smoke job didn''t finish within timeout' }
Write-Host "Fetching smoke-test logs..."
kubectl -n $KubeNamespace logs -l job-name=smoke-test-idempotent --tail=200

Write-Host "Automation complete."
