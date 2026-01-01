param(
    [string]$TaskName = "LMS-AI-MCP-Server"
)
try {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        Write-Output "Unregistered scheduled task '$TaskName'."
    } else {
        Write-Output "Scheduled task '$TaskName' not found."
    }
} catch {
    Write-Error "Failed to unregister scheduled task: $($_.Exception.Message)"
    exit 1
}
