param(
  [string]$FilePath = "backend/lms_api/Dockerfile",
  [string]$Owner = '73junito',
  [string]$Repo = 'autolearnpro',
  [string]$TargetBranch = 'k8s/env-from-health',
  [switch]$DryRun
)

# Prompt for PAT unless DryRun
if (-not $DryRun) {
  $secure = Read-Host -AsSecureString "Enter GitHub PAT (required to commit file to branch)"
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} else {
  $pat = ''
}
try {
  $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }

  if (-not (Test-Path $FilePath)) { Write-Error "File not found: $FilePath"; exit 1 }
  $abs = (Resolve-Path $FilePath).Path
  $rel = $abs -replace "^" + (Get-Location).Path + "\\?\\\\", '' -replace '\\', '/'
  if ($rel.StartsWith('/')) { $rel = $rel.Substring(1) }

  Write-Output "Reading $rel..."
  $content = Get-Content -Raw -Path $abs -ErrorAction Stop
  if ([string]::IsNullOrEmpty($content)) { Write-Warning "$rel is empty — substituting newline"; $content = "`n" }

  Write-Output "Creating blob for $rel..."
  $blobUri = "https://api.github.com/repos/$Owner/$Repo/git/blobs"
  $blobBody = @{ content = $content; encoding = 'utf-8' } | ConvertTo-Json -Depth 10
  if ($DryRun) { Write-Output "DRYRUN: POST $blobUri (body length: $($blobBody.Length))"; $fakeBlob = "dryrun-" + ([guid]::NewGuid().ToString()); Write-Output ("DRYRUN: Blob created: {0}" -f $fakeBlob); $blob = @{ sha = $fakeBlob } } else { $blob = Invoke-RestMethod -Method Post -Uri $blobUri -Headers $headers -Body $blobBody -ErrorAction Stop; Write-Output ("Blob created: {0}" -f $blob.sha) }

  Write-Output "Fetching target branch ref $TargetBranch..."
  $refUri = "https://api.github.com/repos/$Owner/$Repo/git/ref/heads/$TargetBranch"
  if ($DryRun) { Write-Output "DRYRUN: GET $refUri"; $baseSha = "dryrun-base-sha"; Write-Output "Target branch sha: $baseSha (dryrun)" } else { $ref = Invoke-RestMethod -Uri $refUri -Headers $headers -ErrorAction Stop; $baseSha = $ref.object.sha; Write-Output "Target branch sha: $baseSha" }

  Write-Output "Fetching base commit and tree..."
  $commitUri = "https://api.github.com/repos/$Owner/$Repo/git/commits/$baseSha"
  if ($DryRun) { Write-Output "DRYRUN: GET $commitUri"; $baseTree = "dryrun-tree-sha"; Write-Output "Base tree: $baseTree (dryrun)" } else { $baseCommit = Invoke-RestMethod -Uri $commitUri -Headers $headers -ErrorAction Stop; $baseTree = $baseCommit.tree.sha; Write-Output "Base tree: $baseTree" }

  $treeItems = @(@{ path = $rel; mode = '100644'; type = 'blob'; sha = $blob.sha })

  Write-Output "Creating new tree with updated file..."
  $treeUri = "https://api.github.com/repos/$Owner/$Repo/git/trees"
  $treeBody = @{ base_tree = $baseTree; tree = $treeItems } | ConvertTo-Json -Depth 20
  if ($DryRun) { Write-Output "DRYRUN: POST $treeUri (tree entries: $($treeItems.Count))"; $newTreeSha = "dryrun-tree-" + ([guid]::NewGuid().ToString()); Write-Output "DRYRUN: Created tree: $newTreeSha" } else { $newTree = Invoke-RestMethod -Method Post -Uri $treeUri -Headers $headers -Body $treeBody -ErrorAction Stop; $newTreeSha = $newTree.sha; Write-Output "Created tree: $newTreeSha" }

  Write-Output "Creating commit on branch $TargetBranch..."
  $commitCreateUri = "https://api.github.com/repos/$Owner/$Repo/git/commits"
  $commitBody = @{ message = "chore(ci): force mix compile in Dockerfile for CI build"; tree = $newTreeSha; parents = @($baseSha) } | ConvertTo-Json -Depth 10
  if ($DryRun) { Write-Output "DRYRUN: POST $commitCreateUri (message length: $($commitBody.Length))"; $newCommitSha = "dryrun-commit-" + ([guid]::NewGuid().ToString()); Write-Output "DRYRUN: Created commit: $newCommitSha" } else { $newCommit = Invoke-RestMethod -Method Post -Uri $commitCreateUri -Headers $headers -Body $commitBody -ErrorAction Stop; $newCommitSha = $newCommit.sha; Write-Output "Created commit: $newCommitSha" }

  Write-Output "Updating branch ref to new commit..."
  $updateRefUri = "https://api.github.com/repos/$Owner/$Repo/git/refs/heads/$TargetBranch"
  $updateBody = @{ sha = $newCommitSha } | ConvertTo-Json
  if ($DryRun) { Write-Output "DRYRUN: PATCH $updateRefUri (sha: $newCommitSha)"; Write-Output "DRYRUN: Branch $TargetBranch would be updated to commit $newCommitSha" } else { Invoke-RestMethod -Method Patch -Uri $updateRefUri -Headers $headers -Body $updateBody -ErrorAction Stop; Write-Output "Branch $TargetBranch updated to commit $newCommitSha"; Write-Output "Done — file committed to $TargetBranch." }
} finally {
  if (-not $DryRun) { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
