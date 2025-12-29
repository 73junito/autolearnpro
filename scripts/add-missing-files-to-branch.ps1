 $secure = Read-Host -AsSecureString "Enter GitHub PAT (required to patch remote branch)"
 $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 $pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 try {
   $owner = '73junito'
   $repo  = 'autolearnpro'
   $targetBranch = 'k8s/env-from-health'
   $LocalPaths = @('backend/lms_api/mix.exs','backend/lms_api/config/config.exs','backend/lms_api/config/dev.exs','backend/lms_api/config/prod.exs','backend/lms_api/config/runtime.exs')

   $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }

   Write-Output "Fetching target branch ref $targetBranch..."
   $refUri = "https://api.github.com/repos/$owner/$repo/git/ref/heads/$targetBranch"
   $ref = Invoke-RestMethod -Uri $refUri -Headers $headers -ErrorAction Stop
   $baseSha = $ref.object.sha
   Write-Output "Target branch sha: $baseSha"

   $blobs = @()
   foreach ($p in $LocalPaths) {
     Write-Output "Reading $p..."
     $content = Get-Content -Raw -Path $p -ErrorAction Stop
     Write-Output "Creating blob for $p..."
     $blobUri = "https://api.github.com/repos/$owner/$repo/git/blobs"
     $blobBody = @{ content = $content; encoding = 'utf-8' } | ConvertTo-Json
     $blob = Invoke-RestMethod -Method Post -Uri $blobUri -Headers $headers -Body $blobBody -ErrorAction Stop
     $blobs += @{ path = $p; sha = $blob.sha }
     Write-Output ("Blob created for {0}: {1}" -f $p, $blob.sha)
   }

   Write-Output "Fetching base commit and tree..."
   $commitUri = "https://api.github.com/repos/$owner/$repo/git/commits/$baseSha"
   $baseCommit = Invoke-RestMethod -Uri $commitUri -Headers $headers -ErrorAction Stop
   $baseTree = $baseCommit.tree.sha
   Write-Output "Base tree: $baseTree"

   $treeItems = @()
   foreach ($b in $blobs) {
     $treeItems += @{ path = $b.path; mode = '100644'; type = 'blob'; sha = $b.sha }
   }

   Write-Output "Creating new tree with updated files..."
   $treeUri = "https://api.github.com/repos/$owner/$repo/git/trees"
   $treeBody = @{ base_tree = $baseTree; tree = $treeItems } | ConvertTo-Json -Depth 10
   $newTree = Invoke-RestMethod -Method Post -Uri $treeUri -Headers $headers -Body $treeBody -ErrorAction Stop
   $newTreeSha = $newTree.sha
   Write-Output "Created tree: $newTreeSha"

   Write-Output "Creating commit on branch $targetBranch..."
   $commitCreateUri = "https://api.github.com/repos/$owner/$repo/git/commits"
   $commitBody = @{ message = "chore(ci): add missing mix and config files to $targetBranch"; tree = $newTreeSha; parents = @($baseSha) } | ConvertTo-Json
   $newCommit = Invoke-RestMethod -Method Post -Uri $commitCreateUri -Headers $headers -Body $commitBody -ErrorAction Stop
   $newCommitSha = $newCommit.sha
   Write-Output "Created commit: $newCommitSha"

   Write-Output "Updating branch ref to new commit..."
   $updateRefUri = "https://api.github.com/repos/$owner/$repo/git/refs/heads/$targetBranch"
   $updateBody = @{ sha = $newCommitSha } | ConvertTo-Json
   Invoke-RestMethod -Method Patch -Uri $updateRefUri -Headers $headers -Body $updateBody -ErrorAction Stop
   Write-Output "Branch $targetBranch updated to commit $newCommitSha"
   Write-Output "Done — missing files added to $targetBranch. Re-dispatch workflow to verify." 
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
