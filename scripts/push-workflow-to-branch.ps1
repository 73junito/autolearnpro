 $secure = Read-Host -AsSecureString "Enter GitHub PAT (required to push workflow to branch)"
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

   Write-Output "Creating blob for workflow content..."
   $blobUri = "https://api.github.com/repos/$owner/$repo/git/blobs"
   $blobBody = @{ content = $content; encoding = 'utf-8' } | ConvertTo-Json
   $blob = Invoke-RestMethod -Method Post -Uri $blobUri -Headers $headers -Body $blobBody -ErrorAction Stop
   $blobSha = $blob.sha
   Write-Output "Created blob: $blobSha"

   Write-Output "Fetching target branch ref $targetBranch..."
   $refUri = "https://api.github.com/repos/$owner/$repo/git/ref/heads/$targetBranch"
   $ref = Invoke-RestMethod -Uri $refUri -Headers $headers -ErrorAction Stop
   $baseSha = $ref.object.sha
   Write-Output "Target branch sha: $baseSha"

   Write-Output "Fetching base commit and tree..."
   $commitUri = "https://api.github.com/repos/$owner/$repo/git/commits/$baseSha"
   $baseCommit = Invoke-RestMethod -Uri $commitUri -Headers $headers -ErrorAction Stop
   $baseTree = $baseCommit.tree.sha
   Write-Output "Base tree: $baseTree"

   Write-Output "Creating new tree with updated workflow file..."
   $treeUri = "https://api.github.com/repos/$owner/$repo/git/trees"
   $treeBody = @{ base_tree = $baseTree; tree = @(@{ path = $path; mode = '100644'; type = 'blob'; sha = $blobSha }) } | ConvertTo-Json -Depth 6
   $newTree = Invoke-RestMethod -Method Post -Uri $treeUri -Headers $headers -Body $treeBody -ErrorAction Stop
   $newTreeSha = $newTree.sha
   Write-Output "Created tree: $newTreeSha"

   Write-Output "Creating commit on branch $targetBranch..."
   $commitCreateUri = "https://api.github.com/repos/$owner/$repo/git/commits"
   $commitBody = @{ message = "ci: sync publish-image.yml from main to $targetBranch"; tree = $newTreeSha; parents = @($baseSha) } | ConvertTo-Json
   $newCommit = Invoke-RestMethod -Method Post -Uri $commitCreateUri -Headers $headers -Body $commitBody -ErrorAction Stop
   $newCommitSha = $newCommit.sha
   Write-Output "Created commit: $newCommitSha"

   Write-Output "Updating branch ref to new commit..."
   $updateRefUri = "https://api.github.com/repos/$owner/$repo/git/refs/heads/$targetBranch"
   $updateBody = @{ sha = $newCommitSha } | ConvertTo-Json
   Invoke-RestMethod -Method Patch -Uri $updateRefUri -Headers $headers -Body $updateBody -ErrorAction Stop
   Write-Output "Branch $targetBranch updated to commit $newCommitSha"
   Write-Output "Done — workflow synced to branch $targetBranch. Re-dispatch the workflow to verify." 
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
