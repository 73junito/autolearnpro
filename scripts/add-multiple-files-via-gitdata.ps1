param(
  [string[]]$LocalPaths = @('backend/lms_api/mix.exs','backend/lms_api/config/config.exs','backend/lms_api/config/dev.exs','backend/lms_api/config/prod.exs','backend/lms_api/config/runtime.exs'),
  [string]$Owner = '73junito',
  [string]$Repo = 'autolearnpro'
)

$secure = Read-Host -AsSecureString "Enter GitHub PAT (for creating branch + PR via Git Data API)"
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)

try {
  $baseBranch = 'main'
  $timestamp = (Get-Date).ToString('yyyyMMddHHmmss')
  $newBranch = "add/missing-app-files-$timestamp"

  $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }

  Write-Output "Fetching base branch $baseBranch ref..."
  $refUri = "https://api.github.com/repos/$Owner/$Repo/git/ref/heads/$baseBranch"
  $baseRef = Invoke-RestMethod -Uri $refUri -Headers $headers -ErrorAction Stop
  $baseSha = $baseRef.object.sha
  Write-Output "Base branch sha: $baseSha"

  Write-Output "Creating new branch $newBranch..."
  $createRefUri = "https://api.github.com/repos/$Owner/$Repo/git/refs"
  $createBody = @{ ref = "refs/heads/$newBranch"; sha = $baseSha } | ConvertTo-Json
  $created = Invoke-RestMethod -Method Post -Uri $createRefUri -Headers $headers -Body $createBody -ErrorAction Stop
  Write-Output "Created branch $newBranch"

  $blobs = @()
  foreach ($p in $LocalPaths) {
    Write-Output "Reading $p..."
    $content = Get-Content -Raw -Path $p -ErrorAction Stop
    Write-Output "Creating blob for $p..."
    $blobUri = "https://api.github.com/repos/$Owner/$Repo/git/blobs"
    $blobBody = @{ content = $content; encoding = 'utf-8' } | ConvertTo-Json
    $blob = Invoke-RestMethod -Method Post -Uri $blobUri -Headers $headers -Body $blobBody -ErrorAction Stop
    $blobs += @{ path = $p; sha = $blob.sha }
    Write-Output ("Blob created for {0}: {1}" -f $p, $blob.sha)
  }

  Write-Output "Fetching base commit and tree..."
  $commitUri = "https://api.github.com/repos/$Owner/$Repo/git/commits/$baseSha"
  $baseCommit = Invoke-RestMethod -Uri $commitUri -Headers $headers -ErrorAction Stop
  $baseTree = $baseCommit.tree.sha
  Write-Output "Base tree: $baseTree"

  $treeItems = @()
  foreach ($b in $blobs) {
    $treeItems += @{ path = $b.path; mode = '100644'; type = 'blob'; sha = $b.sha }
  }

  Write-Output "Creating new tree with updated files..."
  $treeUri = "https://api.github.com/repos/$Owner/$Repo/git/trees"
  $treeBody = @{ base_tree = $baseTree; tree = $treeItems } | ConvertTo-Json -Depth 10
  $newTree = Invoke-RestMethod -Method Post -Uri $treeUri -Headers $headers -Body $treeBody -ErrorAction Stop
  $newTreeSha = $newTree.sha
  Write-Output "Created tree: $newTreeSha"

  Write-Output "Creating commit..."
  $commitCreateUri = "https://api.github.com/repos/$Owner/$Repo/git/commits"
  $commitBody = @{ message = "chore(ci): add missing mix/config files under backend/lms_api"; tree = $newTreeSha; parents = @($baseSha) } | ConvertTo-Json
  $newCommit = Invoke-RestMethod -Method Post -Uri $commitCreateUri -Headers $headers -Body $commitBody -ErrorAction Stop
  $newCommitSha = $newCommit.sha
  Write-Output "Created commit: $newCommitSha"

  Write-Output "Updating branch ref to new commit..."
  $updateRefUri = "https://api.github.com/repos/$Owner/$Repo/git/refs/heads/$newBranch"
  $updateBody = @{ sha = $newCommitSha } | ConvertTo-Json
  Invoke-RestMethod -Method Patch -Uri $updateRefUri -Headers $headers -Body $updateBody -ErrorAction Stop
  Write-Output "Branch $newBranch updated to commit $newCommitSha"

  Write-Output "Creating pull request from $newBranch into $baseBranch..."
  $prUri = "https://api.github.com/repos/$Owner/$Repo/pulls"
  $prBody = @{ title = "chore: restore missing app files for CI build"; head = $newBranch; base = $baseBranch; body = "Add mix.exs and config files under backend/lms_api so CI builds succeed." } | ConvertTo-Json
  $pr = Invoke-RestMethod -Method Post -Uri $prUri -Headers $headers -Body $prBody -ErrorAction Stop
  Write-Output "PR created: $($pr.html_url)"
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
