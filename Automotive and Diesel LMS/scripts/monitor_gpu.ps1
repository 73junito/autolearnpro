# GPU monitor: appends nvidia-smi snapshots to a rolling log
# Usage: PowerShell -File scripts\monitor_gpu.ps1 -Interval 5 -OutDir ".\\logs"
param(
    [int]$Interval = 5,
    [string]$OutDir = "./logs",
    [int]$KeepFiles = 7
)

$fullOut = Join-Path -Path (Get-Location) -ChildPath $OutDir
if (-not (Test-Path $fullOut)) { New-Item -ItemType Directory -Path $fullOut | Out-Null }
$log = Join-Path $fullOut "gpu-usage-$(Get-Date -Format yyyyMMdd).log"

Write-Output "Logging GPU snapshots to: $log"

while ($true) {
    $ts = Get-Date -Format o
    Add-Content -Path $log -Value "===== $ts ====="
    try {
        nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv | Add-Content -Path $log
    } catch {
        # fallback to plain nvidia-smi if query flags not supported
        try { nvidia-smi | Add-Content -Path $log } catch { Add-Content -Path $log -Value "nvidia-smi not found or failed at $ts" }
    }
    Start-Sleep -Seconds $Interval

    # rotate older logs
    Get-ChildItem -Path $fullOut -Filter "gpu-usage-*.log" | Where-Object { ($_.LastWriteTime -lt (Get-Date).AddDays(-$KeepFiles)) } | Remove-Item -Force -ErrorAction SilentlyContinue
}
