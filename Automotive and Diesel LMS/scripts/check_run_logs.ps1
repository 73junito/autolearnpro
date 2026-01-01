param([string]$runId='20328436046')
$owner='73junito'
$repo='autolearnpro'
$url = "https://api.github.com/repos/$owner/$repo/actions/runs/$runId/logs"
try {
    $resp = Invoke-WebRequest -Uri $url -Method Head -Headers @{ 'User-Agent' = 'vscode' } -MaximumRedirection 0 -ErrorAction Stop
    Write-Output ("STATUS:$($resp.StatusCode)")
} catch {
    if ($_.Exception.Response) {
        $r = $_.Exception.Response
        Write-Output ("RESPONSE_STATUS:$($r.StatusCode) MESSAGE:$($_.Exception.Message)")
    } else {
        Write-Output ("ERROR: $($_.Exception.Message)")
    }
}
