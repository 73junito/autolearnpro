# Use Ollama Flux_AI to request data-URI PNG thumbnails and save them
$ErrorActionPreference='Continue'
$basePrompts = @(
  'A high-detail technical illustration of a diesel engine workshop, realistic, cinematic lighting',
  'A mechanic using diagnostic tools on a modern engine, photorealistic, high detail',
  'Close-up photo of a fuel injection system, studio lighting, realistic'
)
$model='Flux_AI/Flux_AI:latest'
$outdir='D:\Automotive and Diesel LMS\docs\site\images'
if (-not (Test-Path $outdir)) { New-Item -ItemType Directory -Path $outdir -Force | Out-Null }
$i=1
foreach ($bp in $basePrompts) {
  $prompt = "Return a data URI (data:image/png;base64,...) for a 512x384 PNG representing: $bp. Output only the data URI."
  Write-Host "Requesting data URI for thumbnail $i..."
  try {
    $raw = & ollama run $model $prompt 2>$null
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
    Write-Host "No data URI returned; saved text output to: $txtfile" -ForegroundColor Yellow
  }
  $i++
}
Write-Host 'Done.' -ForegroundColor Cyan
