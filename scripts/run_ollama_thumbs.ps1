# Run Ollama model to produce thumbnails (data URI) and save images or text outputs
$ErrorActionPreference = 'Continue'
$prompts = @(
  'A high-detail technical illustration of a diesel engine workshop, realistic, cinematic lighting',
  'A mechanic using diagnostic tools on a modern engine, photorealistic, high detail',
  'Close-up photo of a fuel injection system, studio lighting, realistic'
)
$model = 'Flux_AI/Flux_AI:latest'
$outdir = 'D:\Automotive and Diesel LMS\docs\site\images'
if (-not (Test-Path $outdir)) { New-Item -ItemType Directory -Path $outdir -Force | Out-Null }
$i = 1
foreach ($p in $prompts) {
  Write-Host "Running model for thumbnail $i..."
  try {
    $raw = & ollama run $model $p 2>$null
  } catch {
    Write-Host "ollama run failed: $_" -ForegroundColor Red
    $raw = @()
  }
  $text = $raw -join "`n"
  $m = [regex]::Match($text, 'data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)')
  $outfile = Join-Path $outdir ("course-$i.png")
  if ($m.Success) {
    $b64 = $m.Groups[2].Value
    try {
      $bytes = [System.Convert]::FromBase64String($b64)
      [System.IO.File]::WriteAllBytes($outfile, $bytes)
      Write-Host "Saved: $outfile" -ForegroundColor Green
    } catch {
      Write-Host "Failed to write image: $_" -ForegroundColor Red
      $txtfile = [System.IO.Path]::ChangeExtension($outfile,'.txt')
      $text | Out-File -FilePath $txtfile -Encoding UTF8
      Write-Host "Saved text output to: $txtfile" -ForegroundColor Yellow
    }
  } else {
    $txtfile = [System.IO.Path]::ChangeExtension($outfile,'.txt')
    $text | Out-File -FilePath $txtfile -Encoding UTF8
    Write-Host "No image data; saved text output to: $txtfile" -ForegroundColor Yellow
  }
  $i++
}
Write-Host 'Done.' -ForegroundColor Cyan
