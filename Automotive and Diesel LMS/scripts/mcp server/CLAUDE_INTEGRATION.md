# Claude / MCP Integration

This file shows an example Claude Desktop configuration to launch the MCP server (using the provided wrapper) so Claude can talk to it over stdio.

1) Ensure `run-mcp.ps1` is executable and working:

```powershell
cd "D:\Automotive and Diesel LMS\scripts\mcp server"
./run-mcp.ps1
```

2) Example Claude Desktop `agents` entry (JSON) — point to PowerShell wrapper:

```json
{
  "course-content-generator": {
    "command": "powershell",
    "args": ["-File", "D:/Automotive and Diesel LMS/scripts/mcp server/run-mcp.ps1"],
    "description": "Course content generator MCP server (stdio)"
  }
}
```

Notes
- Claude Desktop / other MCP clients typically expect a command they can spawn; the wrapper starts the Docker container attached to stdio so the client connects to its stdin/stdout.
- If you prefer running the MCP server locally (not in Docker), change the `command` to `node` and `args` to point to `build/index.js` after `npm run build`.

Security
- Be mindful of where you run this; the wrapper runs Docker and exposes stdio to the client process. Limit access accordingly.
