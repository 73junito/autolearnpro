$secure = Read-Host -AsSecureString "Enter GitHub PAT (for creating branch + PR)"
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
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($content))

  Write-Output "Fetching file info on new branch to get current sha..."
  $fileUri = "https://api.github.com/repos/$owner/$repo/contents/$path?ref=$newBranch"
  try {
    $fileInfo = Invoke-RestMethod -Uri $fileUri -Headers $headers -ErrorAction Stop
    $fileSha = $fileInfo.sha
    Write-Output "Found existing file sha on branch: $fileSha"
  } catch {
    Write-Output "File not found on new branch; checking base branch for existing file sha..."
    # If the file exists on the base branch, use that sha when updating via the Contents API
    $baseFileUri = "https://api.github.com/repos/$owner/$repo/contents/$path?ref=$baseBranch"
    try {
      $baseFileInfo = Invoke-RestMethod -Uri $baseFileUri -Headers $headers -ErrorAction Stop
      $fileSha = $baseFileInfo.sha
      Write-Output "Found existing file sha on base branch: $fileSha"
    } catch {
      Write-Output "File not found on base branch either; will create file on new branch."
      $fileSha = $null
    }
  }

  $updateUri = "https://api.github.com/repos/$owner/$repo/contents/$path"
  $body = @{ message = "ci: fix Dockerfile path for buildx (context-relative)"; content = $b64; branch = $newBranch }
  if ($fileSha) { $body.sha = $fileSha }
  $json = $body | ConvertTo-Json -Depth 6
  Write-Output "Updating file on branch $newBranch..."
  $putResp = Invoke-RestMethod -Method Put -Uri $updateUri -Headers $headers -Body $json -ErrorAction Stop
  Write-Output "File updated in commit $($putResp.commit.sha)"

  Write-Output "Creating pull request from $newBranch into $baseBranch..."
  $prUri = "https://api.github.com/repos/$owner/$repo/pulls"
  $prBody = @{ title = "Fix: Dockerfile path for buildx (context-relative)"; head = $newBranch; base = $baseBranch; body = "Make buildx use context-relative Dockerfile (context: ./backend/lms_api, file: Dockerfile)" } | ConvertTo-Json
  $pr = Invoke-RestMethod -Method Post -Uri $prUri -Headers $headers -Body $prBody -ErrorAction Stop
  Write-Output "PR created: $($pr.html_url)"
  Write-Output "Please review and merge the PR; once merged, re-run the workflow or tell me to monitor." 
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
