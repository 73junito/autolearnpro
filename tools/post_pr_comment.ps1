$ghPath = 'C:\Program Files\GitHub CLI\gh.exe'
if (-not (Test-Path $ghPath)) {
    Write-Host "Default path $ghPath not found, scanning C:\ (may take a while) ..."
    $g = Get-ChildItem -Path 'C:\' -Filter 'gh.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($g) {
        $ghPath = $g.FullName
    } else {
        Write-Host 'gh.exe not found on disk'
        exit 1
    }
}
Write-Host "Using gh at: $ghPath"
$pr = & $ghPath pr view --repo 73junito/autolearnpro --head ci/skip-ollama-tests --json number --jq '.number'
Write-Host "PR_NUMBER=$pr"
& $ghPath pr comment $pr --body-file PR_COMMENT.md
