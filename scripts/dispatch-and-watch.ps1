$secure = Read-Host -AsSecureString "Enter GitHub PAT (for dispatch)"
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
try {
  $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'autolearnpro-agent' }
  $owner = '73junito'
  $repo  = 'autolearnpro'
  $wf    = 'publish-image.yml'
  $branch = 'k8s/env-from-health'

  $dispatchUri = "https://api.github.com/repos/$owner/$repo/actions/workflows/$wf/dispatches"
  $dispatchBody = @{ ref = $branch } | ConvertTo-Json
  Write-Output "Dispatching workflow $wf on branch $branch..."
  Invoke-RestMethod -Method Post -Uri $dispatchUri -Headers $headers -Body $dispatchBody -ErrorAction Stop
  Write-Output 'Dispatch requested. Waiting for run to appear...'

  Start-Sleep -Seconds 3
  $runId = $null
  for ($i = 0; $i -lt 60; $i++) {
    $runs = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/workflows/$wf/runs?per_page=20" -Headers $headers
    foreach ($r in $runs.workflow_runs) { if ($r.head_branch -eq $branch) { $runId = $r.id; break } }
    if ($runId) { break }
    Start-Sleep -Seconds 5
  }

  if (-not $runId) {
    Write-Output "Could not find a run for branch $branch; aborting."
    exit 1
  }

  $runUrl = "https://github.com/$owner/$repo/actions/runs/$runId"
  Write-Output ("Found run id {0}: {1}" -f $runId, $runUrl)

  while ($true) {
    $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/runs/$runId" -Headers $headers
    Write-Output ("Run status: {0} - conclusion: {1}" -f $r.status, $r.conclusion)
    if ($r.status -eq 'completed') { break }
    Start-Sleep -Seconds 10
  }

  if ($r.conclusion -eq 'success') {
    Write-Output "Workflow succeeded: $runUrl"
  } else {
    Write-Output "Workflow finished with conclusion: $($r.conclusion); downloading logs..."
    $logsUrl = "https://api.github.com/repos/$owner/$repo/actions/runs/$runId/logs"
    $zipPath = Join-Path $PWD "actions-$runId-logs.zip"
    Invoke-WebRequest -Uri $logsUrl -Headers $headers -OutFile $zipPath -ErrorAction Stop
    $extractDir = Join-Path $PWD "actions-$runId-logs"
    if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir
    Write-Output "Downloaded and extracted logs to $extractDir"
  }
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
