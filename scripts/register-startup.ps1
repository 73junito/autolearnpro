<#
Register a Scheduled Task that runs the `run-server.ps1` wrapper at system startup.
Run as Administrator to register the task for AllUsers.
#>
param(
    [string]$TaskName = "LMS-AI-MCP-Server",
    [switch]$RunAsSystem
)

$scriptPath = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'run-server.ps1')).Path
$psExe = (Get-Command powershell).Source

$action = New-ScheduledTaskAction -Execute $psExe -Argument "-NoProfile -WindowStyle Hidden -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = if ($RunAsSystem) { New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest } else { New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest }

try {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Starts LMS AI MCP Server at system startup" -ErrorAction Stop
    Write-Output "Registered scheduled task '$TaskName' to run $scriptPath at startup."
} catch {
    Write-Error "Failed to register scheduled task: $($_.Exception.Message)"
    exit 1
}
