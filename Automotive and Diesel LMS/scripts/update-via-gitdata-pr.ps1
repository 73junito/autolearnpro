$secure = Read-Host -AsSecureString "Enter GitHub PAT (for creating branch + PR via Git Data API)"
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
try {
  $owner = '73junito'
  $repo  = 'autolearnpro'
  $path  = '.github/workflows/publish-image.yml'
  $baseBranch = 'main'
  $timestamp = (Get-Date).ToString('yyyyMMddHHmmss')
  $newBranch = "fix/dockerfile-context-$timestamp"

  $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }

  Write-Output "Fetching base branch $baseBranch ref..."
  $refUri = "https://api.github.com/repos/$owner/$repo/git/ref/heads/$baseBranch"
  $baseRef = Invoke-RestMethod -Uri $refUri -Headers $headers -ErrorAction Stop
  $baseSha = $baseRef.object.sha
  Write-Output "Base branch sha: $baseSha"

  Write-Output "Creating new branch $newBranch..."
  $createRefUri = "https://api.github.com/repos/$owner/$repo/git/refs"
  $createBody = @{ ref = "refs/heads/$newBranch"; sha = $baseSha } | ConvertTo-Json
  $created = Invoke-RestMethod -Method Post -Uri $createRefUri -Headers $headers -Body $createBody -ErrorAction Stop
  Write-Output "Created branch $newBranch"

  Write-Output "Reading local workflow file $path..."
  $content = Get-Content -Raw -Path $path -ErrorAction Stop

  # Create a blob with the new content
  Write-Output "Creating blob for new content..."
  $blobUri = "https://api.github.com/repos/$owner/$repo/git/blobs"
  $blobBody = @{ content = $content; encoding = 'utf-8' } | ConvertTo-Json
  $blob = Invoke-RestMethod -Method Post -Uri $blobUri -Headers $headers -Body $blobBody -ErrorAction Stop
  $blobSha = $blob.sha
  Write-Output "Created blob: $blobSha"

  # Get base commit and tree
  Write-Output "Fetching base commit and tree..."
  $commitUri = "https://api.github.com/repos/$owner/$repo/git/commits/$baseSha"
  $baseCommit = Invoke-RestMethod -Uri $commitUri -Headers $headers -ErrorAction Stop
  $baseTree = $baseCommit.tree.sha
  Write-Output "Base tree: $baseTree"

  # Create a new tree that updates the workflow file path
  Write-Output "Creating new tree with updated file..."
  $treeUri = "https://api.github.com/repos/$owner/$repo/git/trees"
  $treeBody = @{ base_tree = $baseTree; tree = @(@{ path = $path; mode = '100644'; type = 'blob'; sha = $blobSha }) } | ConvertTo-Json -Depth 6
  $newTree = Invoke-RestMethod -Method Post -Uri $treeUri -Headers $headers -Body $treeBody -ErrorAction Stop
  $newTreeSha = $newTree.sha
  Write-Output "Created tree: $newTreeSha"

  # Create a commit
  Write-Output "Creating commit..."
  $commitCreateUri = "https://api.github.com/repos/$owner/$repo/git/commits"
  $commitBody = @{ message = "ci: fix Dockerfile path for buildx (context-relative)"; tree = $newTreeSha; parents = @($baseSha) } | ConvertTo-Json
  $newCommit = Invoke-RestMethod -Method Post -Uri $commitCreateUri -Headers $headers -Body $commitBody -ErrorAction Stop
  $newCommitSha = $newCommit.sha
  Write-Output "Created commit: $newCommitSha"

  # Update branch ref to point to new commit
  Write-Output "Updating branch ref to new commit..."
  $updateRefUri = "https://api.github.com/repos/$owner/$repo/git/refs/heads/$newBranch"
  $updateBody = @{ sha = $newCommitSha } | ConvertTo-Json
  Invoke-RestMethod -Method Patch -Uri $updateRefUri -Headers $headers -Body $updateBody -ErrorAction Stop
  Write-Output "Branch $newBranch updated to commit $newCommitSha"

  # Create PR
  Write-Output "Creating pull request from $newBranch into $baseBranch..."
  $prUri = "https://api.github.com/repos/$owner/$repo/pulls"
  $prBody = @{ title = "Fix: Dockerfile path for buildx (context-relative)"; head = $newBranch; base = $baseBranch; body = "Make buildx use context-relative Dockerfile (context: ./backend/lms_api, file: Dockerfile)" } | ConvertTo-Json
  $pr = Invoke-RestMethod -Method Post -Uri $prUri -Headers $headers -Body $prBody -ErrorAction Stop
  Write-Output "PR created: $($pr.html_url)"
  Write-Output "Please review and merge the PR; once merged, re-run the workflow or tell me to monitor." 

} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
