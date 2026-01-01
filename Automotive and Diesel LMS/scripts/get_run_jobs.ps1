param([string]$runId='20328436046')
$owner='73junito'
$repo='autolearnpro'
$url = "https://api.github.com/repos/$owner/$repo/actions/runs/$runId/jobs"
try {
    $headers = @{ 'User-Agent' = 'vscode' }
    if ($env:GITHUB_PAT) { $headers['Authorization'] = "Bearer $env:GITHUB_PAT" }
    $jobs = Invoke-RestMethod -Uri $url -Headers $headers -ErrorAction Stop
    foreach ($j in $jobs.jobs) {
        Write-Output ("JOB_ID:$($j.id) NAME:$($j.name) STATUS:$($j.status) CONCLUSION:$($j.conclusion) STEPS:$($j.steps.count) LOGS_URL:$($j.logs_url)")
        foreach ($s in $j.steps) {
            Write-Output ("  STEP: $($s.number) $($s.name) -> $($s.status) / $($s.conclusion)")
        }
    }
} catch {
    Write-Output ("API_ERROR: $($_.Exception.Message)")
    exit 3
}
