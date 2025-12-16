param(
    [string]$RepoUrl = 'https://github.com/73junito/autolearnpro.git',
    [string]$PatchPath = 'D:\Automotive and Diesel LMS\patches\0001-k8s-use-envFrom-for-lms-api-secrets-add-DB-aware-hea.patch',
    [string]$WorkDir = 'C:\temp\autolearnpro-patch-work',
    [string]$Branch = 'k8s/env-from-health'
)

Write-Host "Repo: $RepoUrl"
Write-Host "Patch: $PatchPath"
Write-Host "WorkDir: $WorkDir"
Write-Host "Branch: $Branch"

if (-not (Test-Path $PatchPath)) {
    Write-Error "Patch file not found: $PatchPath"
    exit 2
}

# Clean work dir
if (Test-Path $WorkDir) {
    Write-Host "Removing existing work dir $WorkDir"
    Remove-Item -Recurse -Force $WorkDir
}

Write-Host "Cloning $RepoUrl into $WorkDir"
git clone $RepoUrl $WorkDir
if ($LASTEXITCODE -ne 0) {
    Write-Error "git clone failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Set-Location $WorkDir

Write-Host "Creating branch $Branch"
git checkout -b $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Error "git checkout failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Copying patch into workdir"
Copy-Item -Path $PatchPath -Destination . -Force

Write-Host "Applying patch with git am"
git am .\$(Split-Path $PatchPath -Leaf)
if ($LASTEXITCODE -ne 0) {
    Write-Warning "git am failed (exit $LASTEXITCODE). Attempting fallback: git apply + commit"
    git am --abort 2>$null
    git apply --index .\$(Split-Path $PatchPath -Leaf)
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git apply failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    git commit -m "Apply patch: $(Split-Path $PatchPath -Leaf)"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git commit failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

Write-Host "Pushing branch to origin (you may be prompted for credentials)"
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Error "git push failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Branch pushed: $Branch"
Write-Host "You can open a PR at: $RepoUrl/compare/$Branch"
