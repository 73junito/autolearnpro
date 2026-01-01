<#
Automate Stable Diffusion WebUI setup and run image generation.

Usage (PowerShell):
  .\scripts\auto_sd_run.ps1 -Prompt "..." -OutName catalog-cover

What it does:
 - Optionally clones AUTOMATIC1111 into C:\stable-diffusion-webui if missing
 - Checks for model files in models\Stable-diffusion\ (warns if none)
 - Starts the WebUI (webui-user.bat or python launch.py)
 - Waits for the API at http://127.0.0.1:7860/sdapi/v1/sd-models
 - Calls the Python `scripts/generate_catalog_images.py` with the given prompt

Note: This script does not download model weights.
#>

param(
    [string]$Prompt,
    [string]$OutName = 'catalog',
    [switch]$SkipClone,
    [int]$TimeoutSeconds = 240,
    [switch]$Stop
)

Set-StrictMode -Version Latest

 $root = (Resolve-Path "$(Split-Path -Parent $MyInvocation.MyCommand.Path)").Path
 $target = 'C:\stable-diffusion-webui'
 $repoRoot = Split-Path -Parent $root
 $outDir = Join-Path $repoRoot 'outputs'
 $logDir = Join-Path $outDir 'logs'
 if(-not (Test-Path $outDir)){ New-Item -ItemType Directory -Path $outDir | Out-Null }
 if(-not (Test-Path $logDir)){ New-Item -ItemType Directory -Path $logDir | Out-Null }

function Write-ErrAndExit([string]$m){ Write-Error $m; exit 1 }

if(-not $SkipClone){
    if(-not (Test-Path $target)){
        Write-Output "Cloning AUTOMATIC1111 WebUI into $target..."
        git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git $target
        if($LASTEXITCODE -ne 0){ Write-ErrAndExit 'git clone failed. Install Git or clone manually.' }
    } else { Write-Output "Target folder $target exists." }
} else { Write-Output 'Skipping clone as requested.' }

# Check for models
$modelsDir = Join-Path $target 'models\Stable-diffusion'
if(Test-Path $modelsDir){
    $modelFiles = Get-ChildItem -Path $modelsDir -File -Include *.ckpt,*.safetensors -ErrorAction SilentlyContinue
} else {
    $modelFiles = @()
}
if($modelFiles.Count -eq 0){
    Write-Warning "No model files found in $modelsDir. Place a .ckpt or .safetensors file there before generating images."
}

# Start the WebUI process if not running
function Stop-WebUI(){
    $pidFile = Join-Path $outDir 'sd_webui.pid'
    $stopLog = Join-Path $logDir 'sd_webui_stop.txt'
    if(-not (Test-Path $pidFile)){
        Write-Warning 'No PID file found; nothing to stop.'
        return $false
    }
    $pid = Get-Content -Path $pidFile -Raw | ForEach-Object { $_.Trim() }
    if(-not $pid){ Write-Warning 'PID file empty'; return $false }
    try{
        $p = Get-Process -Id $pid -ErrorAction Stop
        Stop-Process -Id $p.Id -Force -ErrorAction Stop
        "$((Get-Date).ToString('o')) Stopped process $pid" | Out-File -FilePath $stopLog -Encoding utf8 -Append
        Remove-Item -Path $pidFile -ErrorAction SilentlyContinue
        Write-Output "Stopped WebUI PID $pid"
        return $true
    } catch {
        Write-Warning "Could not stop process $pid: $_"
        Remove-Item -Path $pidFile -ErrorAction SilentlyContinue
        return $false
    }
}

function Start-WebUI(){
    $pidFile = Join-Path $outDir 'sd_webui.pid'
    $startLog = Join-Path $logDir "sd_webui_start_$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
    $stdout = Join-Path $logDir "sd_webui_stdout_$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
    $stderr = Join-Path $logDir "sd_webui_stderr_$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

    if(Test-Path (Join-Path $target 'webui-user.bat')){
        Write-Output 'Starting webui-user.bat...'
        $cmd = 'cmd.exe'
        $args = '/c', 'webui-user.bat'
        $proc = Start-Process -FilePath $cmd -ArgumentList $args -WorkingDirectory $target -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        "$((Get-Date).ToString('o')) Started webui-user.bat with PID $($proc.Id)" | Out-File -FilePath $startLog -Encoding utf8 -Append
        Set-Content -Path $pidFile -Value $proc.Id -Encoding utf8
        return $true
    }
    elseif(Test-Path (Join-Path $target 'launch.py')){
        Write-Output 'Starting launch.py with Python...'
        $proc = Start-Process -FilePath 'python' -ArgumentList @(Join-Path $target 'launch.py') -WorkingDirectory $target -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        "$((Get-Date).ToString('o')) Started launch.py with PID $($proc.Id)" | Out-File -FilePath $startLog -Encoding utf8 -Append
        Set-Content -Path $pidFile -Value $proc.Id -Encoding utf8
        return $true
    } else {
        Write-Warning 'No webui-user.bat or launch.py found; cannot start WebUI automatically.'
        return $false
    }
}

# Try to detect if API is already up
function Test-SDAPI(){
    try{
        $r = Invoke-RestMethod -Uri 'http://127.0.0.1:7860/sdapi/v1/sd-models' -UseBasicParsing -ErrorAction Stop
        return $true
    } catch { return $false }
}

if(-not (Test-SDAPI)){
    $started = Start-WebUI
    if(-not $started){ Write-Warning 'WebUI not started. Start it manually and re-run this script.' }
    Write-Output 'Waiting for SD WebUI API to become available...'
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while(-not (Test-SDAPI)) {
        Start-Sleep -Seconds 2
        if($sw.Elapsed.TotalSeconds -gt $TimeoutSeconds){ Write-ErrAndExit "Timed out waiting for SD API after $TimeoutSeconds seconds." }
    }
    Write-Output 'SD API is reachable.'
} else { Write-Output 'SD API already available.' }

# Now call the Python generator
if(-not $Prompt){ Write-ErrAndExit 'Please provide a prompt via -Prompt parameter.' }

$py = 'python'
$genScript = Join-Path $root 'generate_catalog_images.py'
if(-not (Test-Path $genScript)){ Write-ErrAndExit "Generator script not found: $genScript" }

Write-Output "Invoking image generator with prompt: $Prompt"
$args = @('--prompt', $Prompt, '--out', $OutName)
& $py $genScript @args

Write-Output "Done. Images (if any) saved under outputs/catalog_images/."
