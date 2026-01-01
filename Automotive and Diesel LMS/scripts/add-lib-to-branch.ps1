param(
  [switch]$DryRun
)

# Prompt for PAT unless running in DryRun mode
if (-not $DryRun) {
  $secure = Read-Host -AsSecureString "Enter GitHub PAT (required to patch remote branch)"
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} else {
  $pat = ''
}

try {
  $owner = '73junito'
  $repo  = 'autolearnpro'
  $targetBranch = 'k8s/env-from-health'
  $basePath = 'backend/lms_api/lib'

  $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }

  Write-Output "Scanning local files under $basePath..."
  $files = Get-ChildItem -Path $basePath -Recurse -File | Sort-Object FullName
  if ($files.Count -eq 0) { Write-Error "No files found under $basePath"; exit 1 }

  $blobs = @()
  foreach ($f in $files) {
    $rel = $f.FullName -replace "^" + (Get-Location).Path + "\\?\\\\", '' -replace '\\', '/'
    # Make path relative to repo root
    if ($rel.StartsWith('/')) { $rel = $rel.Substring(1) }
    Write-Output "Reading $rel..."
    $content = Get-Content -Raw -Path $f.FullName -ErrorAction Stop
    if ([string]::IsNullOrEmpty($content)) {
      Write-Warning "$rel is empty — substituting newline to satisfy Git blob API"
      $content = "`n"
    }
    Write-Output "Creating blob for $rel..."
    $blobUri = "https://api.github.com/repos/$owner/$repo/git/blobs"
    $blobBody = @{ content = $content; encoding = 'utf-8' } | ConvertTo-Json -Depth 10
    if ($DryRun) {
      Write-Output "DRYRUN: POST $blobUri (body length: $($blobBody.Length))"
      $fakeSha = "dryrun-" + ([guid]::NewGuid().ToString())
      $blobs += @{ path = $rel; sha = $fakeSha }
      Write-Output ("DRYRUN: Blob created for {0}: {1}" -f $rel, $fakeSha)
    } else {
      try {
        $blob = Invoke-RestMethod -Method Post -Uri $blobUri -Headers $headers -Body $blobBody -ErrorAction Stop
        $blobs += @{ path = $rel; sha = $blob.sha }
        Write-Output ("Blob created for {0}: {1}" -f $rel, $blob.sha)
      } catch {
        Write-Error ("Failed to create blob for {0}: {1}" -f $rel, $_.Exception.Message)
        if ($_.Exception.Response -ne $null) {
          try { $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); $body = $sr.ReadToEnd(); Write-Error ("Response body: {0}" -f $body) } catch {}
        }
        throw
      }
    }
  }

  Write-Output "Fetching target branch ref $targetBranch..."
  $refUri = "https://api.github.com/repos/$owner/$repo/git/ref/heads/$targetBranch"
  if ($DryRun) {
    Write-Output "DRYRUN: GET $refUri"
    $baseSha = "dryrun-base-sha"
    Write-Output "Target branch sha: $baseSha (dryrun)"
  } else {
    try { $ref = Invoke-RestMethod -Uri $refUri -Headers $headers -ErrorAction Stop; $baseSha = $ref.object.sha; Write-Output "Target branch sha: $baseSha" } catch { Write-Error "Failed to fetch ref: $($_.Exception.Message)"; throw }
  }

  Write-Output "Fetching base commit and tree..."
  $commitUri = "https://api.github.com/repos/$owner/$repo/git/commits/$baseSha"
  if ($DryRun) {
    Write-Output "DRYRUN: GET $commitUri"
    $baseTree = "dryrun-tree-sha"
    Write-Output "Base tree: $baseTree (dryrun)"
  } else {
    try { $baseCommit = Invoke-RestMethod -Uri $commitUri -Headers $headers -ErrorAction Stop; $baseTree = $baseCommit.tree.sha; Write-Output "Base tree: $baseTree" } catch { Write-Error "Failed to fetch base commit: $($_.Exception.Message)"; throw }
  }

  $treeItems = @()
  foreach ($b in $blobs) {
    $treeItems += @{ path = $b.path; mode = '100644'; type = 'blob'; sha = $b.sha }
  }

  Write-Output "Creating new tree with updated files..."
  $treeUri = "https://api.github.com/repos/$owner/$repo/git/trees"
  $treeBody = @{ base_tree = $baseTree; tree = $treeItems } | ConvertTo-Json -Depth 20
  if ($DryRun) {
    Write-Output "DRYRUN: POST $treeUri (tree entries: $($treeItems.Count))"
    $newTreeSha = "dryrun-tree-" + ([guid]::NewGuid().ToString())
    Write-Output "DRYRUN: Created tree: $newTreeSha"
  } else {
    try { $newTree = Invoke-RestMethod -Method Post -Uri $treeUri -Headers $headers -Body $treeBody -ErrorAction Stop; $newTreeSha = $newTree.sha; Write-Output "Created tree: $newTreeSha" } catch { Write-Error "Failed to create tree: $($_.Exception.Message)"; throw }
  }

  Write-Output "Creating commit on branch $targetBranch..."
  $commitCreateUri = "https://api.github.com/repos/$owner/$repo/git/commits"
  $commitBody = @{ message = "chore(ci): add backend/lms_api/lib files to $targetBranch for CI build"; tree = $newTreeSha; parents = @($baseSha) } | ConvertTo-Json -Depth 10
  if ($DryRun) {
    Write-Output "DRYRUN: POST $commitCreateUri (message length: $($commitBody.Length))"
    $newCommitSha = "dryrun-commit-" + ([guid]::NewGuid().ToString())
    Write-Output "DRYRUN: Created commit: $newCommitSha"
  } else {
    try { $newCommit = Invoke-RestMethod -Method Post -Uri $commitCreateUri -Headers $headers -Body $commitBody -ErrorAction Stop; $newCommitSha = $newCommit.sha; Write-Output "Created commit: $newCommitSha" } catch { Write-Error "Failed to create commit: $($_.Exception.Message)"; throw }
  }

  Write-Output "Updating branch ref to new commit..."
  $updateRefUri = "https://api.github.com/repos/$owner/$repo/git/refs/heads/$targetBranch"
  $updateBody = @{ sha = $newCommitSha } | ConvertTo-Json
  if ($DryRun) {
    Write-Output "DRYRUN: PATCH $updateRefUri (sha: $newCommitSha)"
    Write-Output "DRYRUN: Branch $targetBranch would be updated to commit $newCommitSha"
  } else {
    try { Invoke-RestMethod -Method Patch -Uri $updateRefUri -Headers $headers -Body $updateBody -ErrorAction Stop; Write-Output "Branch $targetBranch updated to commit $newCommitSha" } catch { Write-Error "Failed to update branch ref: $($_.Exception.Message)"; throw }
  }
  Write-Output "Done — lib files added to $targetBranch. Re-dispatch workflow to verify." 
} finally {
  if (-not $DryRun) { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
