<#
Robust salvage: scan text files for base64-like sequences, clean URL-safe chars,
remove whitespace, try decoding largest candidates first, and validate the
decoded bytes for PNG/JPEG signatures before writing files.
#>

$outdir = 'D:\Automotive and Diesel LMS\docs\site\images'
function Try-DecodeBase64Candidate {
  param([string]$candidate)
  if (-not $candidate) { return $null }
  # Remove whitespace and control chars
  $c = $candidate -replace '\s',''
  # If URL-safe base64, convert
  $c = $c.Replace('-','+').Replace('_','/')
  # Strip any characters outside base64 alphabet
  $c = ($c -replace '[^A-Za-z0-9+/=]','')
  # Ensure padding length multiple of 4
  while ($c.Length % 4 -ne 0) { $c += '=' }
  try {
    $bytes = [System.Convert]::FromBase64String($c)
  } catch {
    return $null
  }
  # Validate PNG (89 50 4E 47) or JPEG (FF D8 FF)
  if ($bytes.Length -ge 8) {
    if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) { return $bytes }
    if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8 -and $bytes[2] -eq 0xFF) { return $bytes }
  }
  # Not recognized as image
  return $null
}

for ($i = 1; $i -le 3; $i++) {
  $txt = Join-Path $outdir ("course-$i.txt")
  $png = Join-Path $outdir ("course-$i.png")
  if (-not (Test-Path $txt)) { Write-Host "$txt not found, skipping"; continue }
  $content = Get-Content $txt -Raw

  # 1) Look for explicit data URI
  $dataUriMatch = [regex]::Match($content, 'data:image/(png|jpeg);base64,([A-Za-z0-9+/=\r\n\t -_]+)')
  if ($dataUriMatch.Success) {
    $cand = $dataUriMatch.Groups[2].Value
    $bytes = Try-DecodeBase64Candidate -candidate $cand
    if ($bytes) {
      [System.IO.File]::WriteAllBytes($png, $bytes)
      Write-Host "Recovered image from data URI -> $png" -ForegroundColor Green
      continue
    }
  }

  # 2) Fallback: find long base64-like runs and attempt decode (try longest first)
  $matches = [regex]::Matches($content, '[A-Za-z0-9+/=_\-]{80,}') | ForEach-Object { $_.Value }
  if ($matches.Count -eq 0) { Write-Host "No base64-like matches in $txt"; continue }
  $cands = $matches | Sort-Object Length -Descending
  $recovered = $false
  foreach ($cand in $cands) {
    $bytes = Try-DecodeBase64Candidate -candidate $cand
    if ($bytes) {
      [System.IO.File]::WriteAllBytes($png, $bytes)
      Write-Host "Recovered image from candidate (len $($cand.Length)) -> $png" -ForegroundColor Green
      $recovered = $true
      break
    }
    # As a last resort try trimming trailing chars up to 8 bytes to handle truncated tail
    for ($trim=1; $trim -le 8 -and -not $recovered; $trim++) {
      if ($cand.Length -le $trim) { break }
      $sub = $cand.Substring(0,$cand.Length - $trim)
      $bytes = Try-DecodeBase64Candidate -candidate $sub
      if ($bytes) {
        [System.IO.File]::WriteAllBytes($png, $bytes)
        Write-Host "Recovered image from trimmed candidate (len $($sub.Length)) -> $png" -ForegroundColor Green
        $recovered = $true
        break
      }
    }
    if ($recovered) { break }
  }
  if (-not $recovered) {
    Write-Host "Could not decode any candidate in $txt; saved for inspection." -ForegroundColor Yellow
  }
}

Write-Host 'Salvage attempt complete.' -ForegroundColor Cyan
