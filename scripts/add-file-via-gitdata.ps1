param(
  [string]$LocalPath = 'backend/lms_api/Dockerfile',
  [string]$Owner = '73junito',
  [string]$Repo = 'autolearnpro',
  [switch]$DryRun
)

# Prompt for PAT unless DryRun is requested
if (-not $DryRun) {
  $secure = Read-Host -AsSecureString "Enter GitHub PAT (for creating branch + PR via Git Data API)"
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} else {
  $pat = ''
}

try {
  $baseBranch = 'main'
  $timestamp = (Get-Date).ToString('yyyyMMddHHmmss')
  $newBranch = "add/dockerfile-$timestamp"

  $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }

  Write-Output "Fetching base branch $baseBranch ref..."
  $refUri = "https://api.github.com/repos/$Owner/$Repo/git/ref/heads/$baseBranch"
  if ($DryRun) {
    Write-Output "DRYRUN: GET $refUri"
    $baseSha = "dryrun-base-sha"
    Write-Output "Base branch sha: $baseSha (dryrun)"
  } else {
    try { $baseRef = Invoke-RestMethod -Uri $refUri -Headers $headers -ErrorAction Stop; $baseSha = $baseRef.object.sha; Write-Output "Base branch sha: $baseSha" } catch { Write-Error "Failed to fetch base ref: $($_.Exception.Message)"; throw }
  }

  Write-Output "Creating new branch $newBranch..."
  $createRefUri = "https://api.github.com/repos/$Owner/$Repo/git/refs"
  $createBody = @{ ref = "refs/heads/$newBranch"; sha = $baseSha } | ConvertTo-Json
  if ($DryRun) { Write-Output "DRYRUN: POST $createRefUri (body length: $($createBody.Length))"; Write-Output "DRYRUN: Created branch $newBranch" } else { try { $created = Invoke-RestMethod -Method Post -Uri $createRefUri -Headers $headers -Body $createBody -ErrorAction Stop; Write-Output "Created branch $newBranch" } catch { Write-Error "Failed to create branch: $($_.Exception.Message)"; throw } }

  Write-Output "Reading local file $LocalPath..."
  $content = Get-Content -Raw -Path $LocalPath -ErrorAction Stop

  Write-Output "Creating blob for new content..."
  $blobUri = "https://api.github.com/repos/$Owner/$Repo/git/blobs"
  $blobBody = @{ content = $content; encoding = 'utf-8' } | ConvertTo-Json
  if ($DryRun) { Write-Output "DRYRUN: POST $blobUri (body length: $($blobBody.Length))"; $blobSha = "dryrun-" + ([guid]::NewGuid().ToString()); Write-Output "DRYRUN: Created blob: $blobSha" } else { try { $blob = Invoke-RestMethod -Method Post -Uri $blobUri -Headers $headers -Body $blobBody -ErrorAction Stop; $blobSha = $blob.sha; Write-Output "Created blob: $blobSha" } catch { Write-Error "Failed to create blob: $($_.Exception.Message)"; if ($_.Exception.Response -ne $null) { try { $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); $body = $sr.ReadToEnd(); Write-Error "Response body: $body" } catch {} } throw } }

  Write-Output "Fetching base commit and tree..."
  $commitUri = "https://api.github.com/repos/$Owner/$Repo/git/commits/$baseSha"
  if ($DryRun) { Write-Output "DRYRUN: GET $commitUri"; $baseTree = "dryrun-tree-sha"; Write-Output "Base tree: $baseTree (dryrun)" } else { try { $baseCommit = Invoke-RestMethod -Uri $commitUri -Headers $headers -ErrorAction Stop; $baseTree = $baseCommit.tree.sha; Write-Output "Base tree: $baseTree" } catch { Write-Error "Failed to fetch base commit: $($_.Exception.Message)"; throw } }

  Write-Output "Creating new tree with updated file path $LocalPath..."
  $treeUri = "https://api.github.com/repos/$Owner/$Repo/git/trees"
  $treeBody = @{ base_tree = $baseTree; tree = @(@{ path = $LocalPath; mode = '100644'; type = 'blob'; sha = $blobSha }) } | ConvertTo-Json -Depth 6
  if ($DryRun) { Write-Output "DRYRUN: POST $treeUri (body length: $($treeBody.Length))"; $newTreeSha = "dryrun-tree-" + ([guid]::NewGuid().ToString()); Write-Output "DRYRUN: Created tree: $newTreeSha" } else { try { $newTree = Invoke-RestMethod -Method Post -Uri $treeUri -Headers $headers -Body $treeBody -ErrorAction Stop; $newTreeSha = $newTree.sha; Write-Output "Created tree: $newTreeSha" } catch { Write-Error "Failed to create tree: $($_.Exception.Message)"; throw } }

  Write-Output "Creating commit..."
  $commitCreateUri = "https://api.github.com/repos/$Owner/$Repo/git/commits"
  $commitBody = @{ message = "chore(ci): add backend/lms_api/Dockerfile for CI builds"; tree = $newTreeSha; parents = @($baseSha) } | ConvertTo-Json
  if ($DryRun) { Write-Output "DRYRUN: POST $commitCreateUri (message length: $($commitBody.Length))"; $newCommitSha = "dryrun-commit-" + ([guid]::NewGuid().ToString()); Write-Output "DRYRUN: Created commit: $newCommitSha" } else { try { $newCommit = Invoke-RestMethod -Method Post -Uri $commitCreateUri -Headers $headers -Body $commitBody -ErrorAction Stop; $newCommitSha = $newCommit.sha; Write-Output "Created commit: $newCommitSha" } catch { Write-Error "Failed to create commit: $($_.Exception.Message)"; throw } }

  Write-Output "Updating branch ref to new commit..."
  $updateRefUri = "https://api.github.com/repos/$Owner/$Repo/git/refs/heads/$newBranch"
  $updateBody = @{ sha = $newCommitSha } | ConvertTo-Json
  if ($DryRun) { Write-Output "DRYRUN: PATCH $updateRefUri (sha: $newCommitSha)"; Write-Output "DRYRUN: Branch $newBranch updated to commit $newCommitSha" } else { try { Invoke-RestMethod -Method Patch -Uri $updateRefUri -Headers $headers -Body $updateBody -ErrorAction Stop; Write-Output "Branch $newBranch updated to commit $newCommitSha" } catch { Write-Error "Failed to update branch ref: $($_.Exception.Message)"; throw } }

  Write-Output "Creating pull request from $newBranch into $baseBranch..."
  $prUri = "https://api.github.com/repos/$Owner/$Repo/pulls"
  $prBody = @{ title = "chore: add Dockerfile for CI build"; head = $newBranch; base = $baseBranch; body = "Add Dockerfile under backend/lms_api so CI can build the release image." } | ConvertTo-Json
  if ($DryRun) { Write-Output "DRYRUN: POST $prUri (title: $($prBody | ConvertFrom-Json | Select-Object -Expand title))"; Write-Output "DRYRUN: PR created: https://github.com/$Owner/$Repo/pull/dryrun" } else { try { $pr = Invoke-RestMethod -Method Post -Uri $prUri -Headers $headers -Body $prBody -ErrorAction Stop; Write-Output "PR created: $($pr.html_url)" } catch { Write-Error "Failed to create PR: $($_.Exception.Message)"; throw } }
} finally {
  if (-not $DryRun) { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
