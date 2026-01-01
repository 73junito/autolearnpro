Run-server wrapper

This folder contains a PowerShell wrapper to start the LMS AI MCP Server using the Windows-friendly `npm.cmd` shim and collect logs.

Basic usage (from repository root):

```powershell
# Start the server and write logs to ./logs/server.log
powershell -File .\scripts\run-server.ps1

# Or run in background (detached) using Start-Process
Start-Process -FilePath powershell -ArgumentList '-NoProfile','-WindowStyle','Hidden','-File',(Resolve-Path .\scripts\run-server.ps1) -WorkingDirectory (Resolve-Path .) -WindowStyle Hidden
```

Notes:

- The script writes runtime output to `logs/server.log` and rotates when the file exceeds 10MB by default.
- The script calls `npm.cmd run start` to avoid PowerShell `.cmd` shim issues.
- To customize log directory or size, pass parameters:

```powershell
powershell -File .\scripts\run-server.ps1 -LogDir '..\mylogs' -MaxBytes 5242880
```

If you want a service (auto-start, auto-restart), I can configure `pm2` or `nssm` next.

Register at startup
-------------------

Use the Scheduled Task helper to auto-start the server at system boot:

```powershell
# Register (run as Admin to register for SYSTEM)
powershell -File .\scripts\register-startup.ps1 -RunAsSystem

# Unregister
powershell -File .\scripts\unregister-startup.ps1
```
