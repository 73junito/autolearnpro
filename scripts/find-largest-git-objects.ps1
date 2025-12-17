# PowerShell script to list top 50 largest blob objects in git history
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\find-largest-git-objects.ps1

if (-not (Test-Path ".git")) {
  Write-Error "Not a git repository (no .git directory found)."
  exit 1
}

Write-Host "Generating object list..."
git rev-list --objects --all > .git\objects_list.txt

Write-Host "Getting object sizes (this may take a while)..."
Get-Content .git\objects_list.txt | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' > .git\objects_size.txt

Write-Host "Parsing and listing top 50 blobs by size...\n"
Get-Content .git\objects_size.txt | Where-Object { $_ -like 'blob *' } | ForEach-Object {
    $parts = $_ -split ' '
    $size = [int64]$parts[2]
    $path = $parts[3..($parts.Length - 1)] -join ' '
    [PSCustomObject]@{ Size = $size; Path = $path }
} | Sort-Object -Property Size -Descending | Select-Object -First 50 | Format-Table -AutoSize

Write-Host "\nDone. The full object lists are saved to .git\objects_list.txt and .git\objects_size.txt"