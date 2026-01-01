 $secure = Read-Host -AsSecureString "Enter GitHub PAT (required to patch remote branch)"
 $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 $pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 try {
   $owner = '73junito'
   $repo  = 'autolearnpro'
   $targetBranch = 'k8s/env-from-health'
   $path  = '.github/workflows/publish-image.yml'

   $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }

   Write-Output "Reading local workflow file $path..."
   $content = Get-Content -Raw -Path $path -ErrorAction Stop

   # Make the minimal replacements: ensure buildx uses context-relative Dockerfile and only amd64
   $new = $content -replace "(?ms)file:\s*.*","file: Dockerfile"
   $new = $new -replace "(?m)platforms:\s*.*","platforms: linux/amd64"

   # Create blob for new content
   Write-Output "Creating blob for updated workflow..."
   $blobUri = "https://api.github.com/repos/$owner/$repo/git/blobs"
   $blobBody = @{ content = $new; encoding = 'utf-8' } | ConvertTo-Json
   $blob = Invoke-RestMethod -Method Post -Uri $blobUri -Headers $headers -Body $blobBody -ErrorAction Stop
   $blobSha = $blob.sha
   Write-Output "Created blob: $blobSha"

   # Fetch target branch ref
   Write-Output "Fetching target branch ref $targetBranch..."
   $refUri = "https://api.github.com/repos/$owner/$repo/git/ref/heads/$targetBranch"
   $ref = Invoke-RestMethod -Uri $refUri -Headers $headers -ErrorAction Stop
   $baseSha = $ref.object.sha
   Write-Output "Target branch sha: $baseSha"

   # Get base commit and tree
   $commitUri = "https://api.github.com/repos/$owner/$repo/git/commits/$baseSha"
   $baseCommit = Invoke-RestMethod -Uri $commitUri -Headers $headers -ErrorAction Stop
   $baseTree = $baseCommit.tree.sha
   Write-Output "Base tree: $baseTree"

   # Create new tree with updated file
   Write-Output "Creating new tree with updated workflow file..."
   $treeUri = "https://api.github.com/repos/$owner/$repo/git/trees"
   $treeBody = @{ base_tree = $baseTree; tree = @(@{ path = $path; mode = '100644'; type = 'blob'; sha = $blobSha }) } | ConvertTo-Json -Depth 6
   $newTree = Invoke-RestMethod -Method Post -Uri $treeUri -Headers $headers -Body $treeBody -ErrorAction Stop
   $newTreeSha = $newTree.sha
   Write-Output "Created tree: $newTreeSha"

   # Create commit
   Write-Output "Creating commit on branch $targetBranch..."
   $commitCreateUri = "https://api.github.com/repos/$owner/$repo/git/commits"
   $commitBody = @{ message = "ci: fix Dockerfile path for buildx on $targetBranch"; tree = $newTreeSha; parents = @($baseSha) } | ConvertTo-Json
   $newCommit = Invoke-RestMethod -Method Post -Uri $commitCreateUri -Headers $headers -Body $commitBody -ErrorAction Stop
   $newCommitSha = $newCommit.sha
   Write-Output "Created commit: $newCommitSha"

   # Update branch ref to new commit
   Write-Output "Updating branch ref to new commit..."
   $updateRefUri = "https://api.github.com/repos/$owner/$repo/git/refs/heads/$targetBranch"
   $updateBody = @{ sha = $newCommitSha } | ConvertTo-Json
   Invoke-RestMethod -Method Patch -Uri $updateRefUri -Headers $headers -Body $updateBody -ErrorAction Stop
   Write-Output "Branch $targetBranch updated to commit $newCommitSha"
   Write-Output "Done — the workflow on branch $targetBranch is patched. You can re-dispatch the workflow or I can do it now."
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
