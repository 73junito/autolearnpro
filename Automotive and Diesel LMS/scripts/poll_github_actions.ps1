$owner='73junito'
$repo='autolearnpro'
$max=12
for ($i=0; $i -lt $max; $i++) {
    try {
        $url = "https://api.github.com/repos/$owner/$repo/actions/runs?branch=main&per_page=5"
        $runs = Invoke-RestMethod -Uri $url -Headers @{ 'User-Agent' = 'vscode' } -ErrorAction Stop
        if (-not $runs.workflow_runs) { Write-Output 'NO_RUNS'; exit 4 }
        $run = $runs.workflow_runs[0]
        Write-Output ("RUN_STATUS:$($run.status) CONCLUSION:$($run.conclusion) ID:$($run.id) SHA:$($run.head_sha) URL:$($run.html_url)")
        if ($run.status -eq 'completed') {
            if ($run.conclusion -eq 'success') { Write-Output 'WORKFLOW_SUCCESS'; exit 0 } else { Write-Output 'WORKFLOW_COMPLETED_BUT_FAILED'; exit 2 }
        }
    } catch {
        Write-Output ("API_ERROR: $($_.Exception.Message)")
        exit 3
    }
    Start-Sleep -Seconds 10
}
Write-Output 'TIMED_OUT'
exit 4
