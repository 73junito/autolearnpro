<#
Generate thumbnails for the `docs/site` with Stable Diffusion.

Supports two providers:
 - Hugging Face Inference API (requires env var HF_TOKEN)
 - Local Automatic1111 WebUI (running at http://127.0.0.1:7860)

Usage examples:
  # Use local WebUI
  .\generate-sd-thumbnails.ps1 -Provider webui

  # Use Hugging Face inference (ensure HF_TOKEN env var is set)
  $env:HF_TOKEN = 'hf_...'
  .\generate-sd-thumbnails.ps1 -Provider hf

# Outputs (default): `theme/assets/images/docs/course-1.png`, `course-2.png`, `course-3.png`
#
# Notes:
# - For HF, this uses the model `runwayml/stable-diffusion-v1-5` by default.
# - For WebUI, ensure the WebUI sdapi endpoints are enabled.
# - This script is a convenience helper; you can adjust prompts and image size.
#>

param(
  [ValidateSet('hf','webui')]
  [string]$Provider = $(if ($env:HF_TOKEN) { 'hf' } else { 'webui' }),
  [string[]]$Prompts = @( 
    'A high-detail technical illustration of a diesel engine workshop, realistic, cinematic lighting',
    'A mechanic using diagnostic tools on a modern engine, photorealistic, high detail',
    'Close-up photo of a fuel injection system, studio lighting, realistic'
  ),
  [string]$OutputDir = 'D:/Automotive and Diesel LMS/theme/assets/images/docs',
  [string]$WebuiPath = $null,
  [string]$WebuiUrl = 'http://127.0.0.1:7860',
  [switch]$WaitForApi,
  [switch]$RetryWithFp32,
  [switch]$AutoUpdateWebui,
  [int]$ApiTimeoutSec = 300,
  [int]$Width = 512,
  [int]$Height = 384
  ,
  [string]$OllamaFallbackModel = $null
)

# When using local WebUI, optionally wait for the API to become available before generating


if (-not (Test-Path -Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

Write-Host "Provider: $Provider" -ForegroundColor Cyan

# Helper: restart WebUI after updating webui-user.bat to force FP32/no-half
function Restart-Webui-WithNoHalf {
  param(
    [string]$PathToWebui
  )

  if (-not $PathToWebui) { return $false }
  $bat = Join-Path $PathToWebui 'webui-user.bat'
  if (-not (Test-Path $bat)) { return $false }

  # backup
  $bak = "$bat.bak"
  try { Copy-Item -Path $bat -Destination $bak -Force } catch {}

  # ensure COMMANDLINE_ARGS contains the safe flags
  $lines = Get-Content -Path $bat -ErrorAction SilentlyContinue
  $found = $false
  for ($j=0; $j -lt $lines.Count; $j++) {
    if ($lines[$j] -match '^\s*set\s+COMMANDLINE_ARGS=') {
      $lines[$j] = 'set COMMANDLINE_ARGS=--api --medvram --no-half --precision full --opt-split-attention'
      $found = $true
      break
    }
  }
  if (-not $found) {
    $lines = @('set COMMANDLINE_ARGS=--api --medvram --no-half --precision full --opt-split-attention') + $lines
  }
  try { $lines | Set-Content -Path $bat -Force -Encoding UTF8 } catch { return $false }

  # kill python processes that appear to be the webui (best-effort)
  try {
    Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -like "*$PathToWebui*" -or $_.Path -like "*python.exe") } | Stop-Process -Force -ErrorAction SilentlyContinue
  } catch {}

  # start webui
  try {
    # Prefer the venv python if present (commonly Python 3.11). Fallback to py -3.11 launch.py, then .bat.
    $venvPy = Join-Path $PathToWebui 'venv\Scripts\python.exe'
    $launchPy = Join-Path $PathToWebui 'launch.py'
    if (Test-Path $venvPy) {
      Start-Process -FilePath $venvPy -ArgumentList $launchPy -WorkingDirectory $PathToWebui -WindowStyle Minimized
    } elseif (Test-Path $launchPy) {
      Start-Process -FilePath 'py' -ArgumentList '-3.11', $launchPy -WorkingDirectory $PathToWebui -WindowStyle Minimized
    } else {
      Start-Process -FilePath (Join-Path $PathToWebui 'webui-user.bat') -WorkingDirectory $PathToWebui -WindowStyle Minimized
    }
  } catch {
    return $false
  }

  # wait for api
  $uriBase = 'http://127.0.0.1:7860'
  $wait = 0
  while ($wait -lt 240) {
    Start-Sleep -Seconds 3
    try { Invoke-RestMethod -Uri "$uriBase/sdapi/v1/options" -Method Get -TimeoutSec 3 -ErrorAction Stop | Out-Null; return $true } catch {}
    $wait += 3
  }
  return $false
}

for ($i = 0; $i -lt $Prompts.Count; $i++) {
  $idx = $i + 1
  $prompt = $Prompts[$i]
  $outfile = Join-Path $OutputDir "course-$idx.png"
  Write-Host "Generating thumbnail $idx -> $outfile" -ForegroundColor Yellow

  try {
    if ($Provider -eq 'hf') {
      if (-not $env:HF_TOKEN) { throw 'HF_TOKEN environment variable is not set.' }
      $model = 'runwayml/stable-diffusion-v1-5'
      $uri = "https://api-inference.huggingface.co/models/$model"
      $headers = @{ Authorization = "Bearer $env:HF_TOKEN" }
      $body = @{
        inputs = $prompt
        options = @{ wait_for_model = $true }
        parameters = @{ width = $Width; height = $Height }
      } | ConvertTo-Json -Depth 10

      Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -Body $body -ContentType 'application/json' -OutFile $outfile -ErrorAction Stop
      Write-Host "Saved: $outfile" -ForegroundColor Green

    } else {
      if ($WaitForApi) {
        $optionsUri = "$WebuiUrl/sdapi/v1/options"
        Write-Host "Waiting for WebUI API at $optionsUri (timeout ${ApiTimeoutSec}s)..." -ForegroundColor Cyan
        $elapsed = 0
        while ($elapsed -lt $ApiTimeoutSec) {
          try { Invoke-RestMethod -Uri $optionsUri -Method Get -TimeoutSec 3 -ErrorAction Stop | Out-Null; Write-Host 'API ready'; break } catch { Start-Sleep -Seconds 2; $elapsed += 2 }
        }
        if ($elapsed -ge $ApiTimeoutSec) { throw "WebUI API did not become ready within ${ApiTimeoutSec}s" }
      }
      # local AUTOMATIC1111 WebUI sdapi
      $uriBase = $WebuiUrl.TrimEnd('/')
      $uri = "$uriBase/sdapi/v1/txt2img"

      # Ensure WebUI is available; if not, try to start it from WebuiPath
      $isUp = $false
      try {
        Invoke-RestMethod -Uri $uriBase -Method Get -TimeoutSec 3 -ErrorAction Stop | Out-Null
        $isUp = $true
      } catch {
        $isUp = $false
      }

      if (-not $isUp -and $WebuiPath) {
        Write-Host "WebUI not responding at $uriBase; attempting to start from $WebuiPath" -ForegroundColor Yellow
        $batCandidates = @('webui-user.bat','webui.bat','launch.bat')
        $started = $false
        foreach ($b in $batCandidates) {
          $full = Join-Path $WebuiPath $b
          if (Test-Path $full) {
            Write-Host "Starting: $full" -ForegroundColor Cyan
            Start-Process -FilePath $full -WorkingDirectory $WebuiPath -WindowStyle Minimized
            $started = $true
            break
          }
        }
        if (-not $started) {
          # try python launch directly
          $launchPy = Join-Path $WebuiPath 'launch.py'
          if (Test-Path $launchPy) {
            Write-Host "Starting python launch.py in $WebuiPath" -ForegroundColor Cyan
            Start-Process -FilePath python -ArgumentList $launchPy -WorkingDirectory $WebuiPath -WindowStyle Minimized
            $started = $true
          }
        }

        if ($started) {
          # wait for service to come up
          $wait = 0
          while ($wait -lt 180) {
            Start-Sleep -Seconds 2
            try { Invoke-RestMethod -Uri $uriBase -Method Get -TimeoutSec 3 -ErrorAction Stop | Out-Null; break } catch {}
            $wait += 2
          }
          try { Invoke-RestMethod -Uri $uriBase -Method Get -TimeoutSec 3 -ErrorAction Stop | Out-Null; $isUp = $true } catch { $isUp = $false }
        }
      }

      if (-not $isUp) {
        # If the WebUI cannot be started and an Ollama fallback model is provided, try it now.
        if ($OllamaFallbackModel -or $env:OLLAMA_FALLBACK) {
          $model = $OllamaFallbackModel
          if (-not $model) { $model = $env:OLLAMA_FALLBACK }
          Write-Host "WebUI not available; attempting Ollama fallback model: $model" -ForegroundColor Yellow
          try {
            $raw = & ollama run $model "${prompt}" 2>$null
            $text = $raw -join "`n"
            $m = [regex]::Match($text, 'data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)')
            if ($m.Success) {
              $b64 = $m.Groups[2].Value
              $bytes = [System.Convert]::FromBase64String($b64)
              [System.IO.File]::WriteAllBytes($outfile, $bytes)
              Write-Host "Saved via Ollama fallback: $outfile" -ForegroundColor Green
              continue
            }
            $rawNoWs = ($text -replace '\s','')
            if ($rawNoWs.Length -gt 1000 -and ($rawNoWs -match '^[A-Za-z0-9+/=]+$')) {
              $bytes = [System.Convert]::FromBase64String($rawNoWs)
              [System.IO.File]::WriteAllBytes($outfile, $bytes)
              Write-Host "Saved via Ollama fallback (raw base64): $outfile" -ForegroundColor Green
              continue
            }
            $txtFile = [System.IO.Path]::ChangeExtension($outfile,'.txt')
            $text | Out-File -FilePath $txtFile -Encoding UTF8
            Write-Host "Ollama returned non-image output; saved to $txtFile" -ForegroundColor Yellow
            continue
          } catch {
            Write-Host "Ollama fallback failed: $($_)" -ForegroundColor Red
            throw "Stable Diffusion WebUI is not available at $WebuiUrl and could not be started, and Ollama fallback failed."
          }
        }
        throw "Stable Diffusion WebUI is not available at $WebuiUrl and could not be started."
      }

      $payload = @{
        prompt = $prompt
        width = $Width
        height = $Height
        steps = 20
        cfg_scale = 7
      } | ConvertTo-Json -Depth 8

      # Try once; on FP16/NaN failures optionally restart WebUI with --no-half/FP32 and retry
      $didRetry = $false
      try {
        $resp = Invoke-RestMethod -Uri $uri -Method Post -Body $payload -ContentType 'application/json' -ErrorAction Stop
        if ($null -eq $resp.images -or $resp.images.Count -eq 0) { throw 'No images returned from WebUI.' }
        $b64 = $resp.images[0]
        $bytes = [System.Convert]::FromBase64String($b64)
        [System.IO.File]::WriteAllBytes($outfile, $bytes)
        Write-Host "Saved: $outfile" -ForegroundColor Green
      } catch {
        $err = $_.ToString()
        # Detect common FP16/NaN messages
        if ($RetryWithFp32 -and $WebuiPath -and ($err -match 'NaN' -or $err -match 'half' -or $err -match 'does not support half')) {
          Write-Host 'FP16 instability detected (NaNs). Attempting to restart WebUI with --no-half/--precision full and retrying once.' -ForegroundColor Yellow
          $ok = Restart-Webui-WithNoHalf -PathToWebui $WebuiPath
          if ($ok) {
            # wait briefly then retry
            Start-Sleep -Seconds 6
            try {
              $resp = Invoke-RestMethod -Uri $uri -Method Post -Body $payload -ContentType 'application/json' -ErrorAction Stop
              if ($null -eq $resp.images -or $resp.images.Count -eq 0) { throw 'No images returned from WebUI after retry.' }
              $b64 = $resp.images[0]
              $bytes = [System.Convert]::FromBase64String($b64)
              [System.IO.File]::WriteAllBytes($outfile, $bytes)
              Write-Host "Saved after retry: $outfile" -ForegroundColor Green
              $didRetry = $true
            } catch {
              Write-Host "Retry failed: $($_)" -ForegroundColor Red
              throw $_
            }
          } else {
            Write-Host 'Could not restart WebUI automatically. Please set COMMANDLINE_ARGS to include --no-half --precision full and restart.' -ForegroundColor Red
            throw $_
          }
        } else {
          # If an Ollama fallback model is provided, try using it as a last-resort image generator
          if ($OllamaFallbackModel -or $env:OLLAMA_FALLBACK) {
            $model = $OllamaFallbackModel
            if (-not $model) { $model = $env:OLLAMA_FALLBACK }
            Write-Host "Attempting Ollama fallback model: $model" -ForegroundColor Yellow
            try {
              $raw = & ollama run $model "${prompt}" 2>$null
              $text = $raw -join "`n"
              # Try to find a data URI first
              $m = [regex]::Match($text, 'data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)')
              if ($m.Success) {
                $b64 = $m.Groups[2].Value
                $bytes = [System.Convert]::FromBase64String($b64)
                [System.IO.File]::WriteAllBytes($outfile, $bytes)
                Write-Host "Saved via Ollama fallback: $outfile" -ForegroundColor Green
                continue
              }
              # Otherwise, if output looks like raw base64, try to save it
              $rawNoWs = ($text -replace '\s','')
              if ($rawNoWs.Length -gt 1000 -and ($rawNoWs -match '^[A-Za-z0-9+/=]+$')) {
                $bytes = [System.Convert]::FromBase64String($rawNoWs)
                [System.IO.File]::WriteAllBytes($outfile, $bytes)
                Write-Host "Saved via Ollama fallback (raw base64): $outfile" -ForegroundColor Green
                continue
              }
              # If nothing usable, write the text to a .txt for inspection
              $txtFile = [System.IO.Path]::ChangeExtension($outfile,'.txt')
              $text | Out-File -FilePath $txtFile -Encoding UTF8
              Write-Host "Ollama returned non-image output; saved to $txtFile" -ForegroundColor Yellow
            } catch {
              Write-Host "Ollama fallback failed: $($_)" -ForegroundColor Red
            }
          }
          throw $_
        }
      }
    }
  } catch {
    Write-Host ("Error generating thumbnail {0}: {1}" -f $idx, $($_)) -ForegroundColor Red
  }
}

Write-Host 'Done. Open pages under docs/site to preview.' -ForegroundColor Cyan
