<#
Set recommended Ollama environment variables for Windows (PowerShell).

Run in an elevated PowerShell if you want persistent `setx` to succeed for all vars.

Usage:
  # apply to current session only
  .\scripts\set_ollama_env.ps1 -SessionOnly

  # persist for future sessions (uses setx)
  .\scripts\set_ollama_env.ps1 -Persist

Recommended follow-ups:
  - Pre-pull models: `ollama pull <model>` before running `ollama serve`.
  - Exclude the `.ollama` folder from Windows Defender (see repo scripts).
#>

param(
    [switch]$Persist,
    [switch]$SessionOnly
)

function Set-EnvCurrent {
    param($name, $value)
    if ($null -eq $value) { return }
    Set-Item -Path "Env:$name" -Value $value -Force
}

function Set-EnvPersist {
    param($name, $value)
    if ($null -eq $value) { return }
    try {
        setx $name $value | Out-Null
        Write-Output "Persisted $name=$value"
    } catch {
        Write-Warning "Failed to persist $name. Run in elevated PowerShell to persist."
    }
}

# -- Recommended vars --
$recommended = @{
    # Use alternate port 11435 by default to avoid common Docker/WSL conflicts on 11434
    'OLLAMA_HOST' = 'http://127.0.0.1:11435'
    'OLLAMA_MAX_LOADED_MODELS' = '3'
    'OLLAMA_NUM_PARALLEL' = '1'
    'OLLAMA_LOAD_TIMEOUT' = '600s'
    'OLLAMA_KEEP_ALIVE' = '5m0s'
    'GGML_CUDA_INIT' = '1'
    'OLLAMA_DEBUG' = 'INFO'
}

# Apply to current session
foreach ($k in $recommended.Keys) {
    $v = $recommended[$k]
    Set-EnvCurrent -name $k -value $v
}

Write-Output 'Applied variables to current session.'

if ($Persist) {
    foreach ($k in $recommended.Keys) {
        Set-EnvPersist -name $k -value $recommended[$k]
    }
    Write-Output 'Persistence attempted. Open a new terminal to pick up setx variables.'
}

if (-not $Persist -and -not $SessionOnly) {
    Write-Output "No persistence requested. To persist, re-run with -Persist.`nExample: .\\scripts\\set_ollama_env.ps1 -Persist"
}

Write-Output "Next steps:`n  1) Pre-pull your model(s): ollama pull <model> (e.g. registry.ollama.ai/library/qwen3:1.7b)`n  2) Start server: ollama serve`n  3) If GPU memory issues remain, use a smaller model or reduce GPULayers when launching a runner."
