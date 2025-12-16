param(
  [int]$PrNumber = 14,
  [string]$Owner = '73junito',
  [string]$Repo = 'autolearnpro',
  [string]$WorkflowFile = 'publish-image.yml',
  [switch]$DryRun
)

# Prompt for PAT unless DryRun
if (-not $DryRun) {
  $secure = Read-Host -AsSecureString "Enter GitHub PAT (scopes: repo, workflow)"
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} else { $pat = '' }
try {
  $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }

  Write-Output "Fetching PR #$PrNumber info..."
  $prUri = "https://api.github.com/repos/$Owner/$Repo/pulls/$PrNumber"
  if ($DryRun) { Write-Output "DRYRUN: GET $prUri"; $branch = 'add/dockerfile-20251215135348'; Write-Output "PR branch: $branch (dryrun)" } else { $pr = Invoke-RestMethod -Uri $prUri -Headers $headers -ErrorAction Stop; $branch = $pr.head.ref; Write-Output "PR branch: $branch" }

  Write-Output "Waiting for a workflow run for workflow '$WorkflowFile' on branch '$branch'..."
  if ($DryRun) {
    Write-Output "DRYRUN: would poll https://api.github.com/repos/$Owner/$Repo/actions/workflows/$WorkflowFile/runs for branch $branch"
    $runId = "dryrun-20248392833"
  } else {
    $runId = $null
    for ($i = 0; $i -lt 180; $i++) {
      $runsUri = "https://api.github.com/repos/$Owner/$Repo/actions/workflows/$WorkflowFile/runs?per_page=50"
      $runs = Invoke-RestMethod -Uri $runsUri -Headers $headers -ErrorAction Stop
      foreach ($r in $runs.workflow_runs) {
        if ($r.head_branch -eq $branch) { $runId = $r.id; break }
      }
      if ($runId) { break }
      Start-Sleep -Seconds 5
    }
    if (-not $runId) { Write-Error "No workflow run found for branch $branch within the timeout window."; exit 2 }
  }

  $runUrl = "https://github.com/$Owner/$Repo/actions/runs/$runId"
  Write-Output ("Found run id {0}: {1}" -f $runId, $runUrl)

  if ($DryRun) {
    Write-Output "DRYRUN: Would poll run status at https://api.github.com/repos/$Owner/$Repo/actions/runs/$runId"
    Write-Output "Run status: completed - conclusion: failure (dryrun)"
    Write-Output "Workflow finished with conclusion: failure; (dryrun) would download logs from https://api.github.com/repos/$Owner/$Repo/actions/runs/$runId/logs"
    Write-Output "DRYRUN: logs would be saved to actions-$runId-logs.zip and extracted to actions-$runId-logs"
  } else {
    while ($true) {
      $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/actions/runs/$runId" -Headers $headers -ErrorAction Stop
      Write-Output ("Run status: {0} - conclusion: {1}" -f $r.status, $r.conclusion)
      if ($r.status -eq 'completed') { break }
      Start-Sleep -Seconds 10
    }

    if ($r.conclusion -eq 'success') {
      Write-Output "Workflow succeeded: $runUrl"
    } else {
      Write-Output "Workflow finished with conclusion: $($r.conclusion); downloading logs..."
      $logsUrl = "https://api.github.com/repos/$Owner/$Repo/actions/runs/$runId/logs"
      $zipPath = Join-Path $PWD ("actions-$runId-logs.zip")
      Invoke-WebRequest -Uri $logsUrl -Headers $headers -OutFile $zipPath -ErrorAction Stop
      $extractDir = Join-Path $PWD ("actions-$runId-logs")
      if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
      Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir
      Write-Output "Downloaded and extracted logs to $extractDir"
    }
  }
} finally {
  if (-not $DryRun) { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
