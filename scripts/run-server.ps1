param(
    [string]$LogDir = "..\logs",
    [int]$MaxBytes = 10485760
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDir '..')).Path

# Ensure log directory exists
$LogDirFull = Resolve-Path -Path (Join-Path $Root $LogDir) -ErrorAction SilentlyContinue
if (-not $LogDirFull) { New-Item -Path (Join-Path $Root $LogDir) -ItemType Directory | Out-Null; $LogDirFull = Resolve-Path (Join-Path $Root $LogDir) }
$LogDirFull = $LogDirFull.Path

$LogFile = Join-Path $LogDirFull 'server.log'

# Rotate if larger than MaxBytes
if (Test-Path $LogFile) {
    try {
        $size = (Get-Item $LogFile).Length
        if ($size -gt $MaxBytes) {
            $ts = Get-Date -Format "yyyyMMdd-HHmmss"
            $arch = "$LogFile.$ts"
            Move-Item -LiteralPath $LogFile -Destination $arch -Force
        }
    } catch {
        Write-Warning "Log rotation check failed: $($_.Exception.Message)"
    }
}

Write-Output "Starting LMS AI MCP Server in $Root, logging to $LogFile"

# Start using npm.cmd to avoid PowerShell shim issues
$npm = 'npm.cmd'
$args = @('run','start')

# Start process and redirect output
try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $npm
    $psi.Arguments = [string]::Join(' ', $args)
    $psi.WorkingDirectory = $Root
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $proc.Start() | Out-Null

    $stdOut = $proc.StandardOutput
    $stdErr = $proc.StandardError

    # Asynchronously write output to log file
    Start-Job -ScriptBlock {
        param($outStream, $errStream, $logPath)
        while (-not $outStream.EndOfStream -or -not $errStream.EndOfStream) {
            while (-not $outStream.EndOfStream) {
                $line = $outStream.ReadLine()
                Add-Content -Path $logPath -Value $line
            }
            while (-not $errStream.EndOfStream) {
                $line = $errStream.ReadLine()
                Add-Content -Path $logPath -Value $line
            }
            Start-Sleep -Milliseconds 200
        }
        # Drain remaining
        while (-not $outStream.EndOfStream) { Add-Content -Path $logPath -Value $outStream.ReadLine() }
        while (-not $errStream.EndOfStream) { Add-Content -Path $logPath -Value $errStream.ReadLine() }
    } -ArgumentList $stdOut, $stdErr, $LogFile | Out-Null

    Write-Output "Server started (PID $($proc.Id)). Use logs in $LogFile to inspect output."
} catch {
    Write-Error "Failed to start server: $($_.Exception.Message)"
    exit 1
}
