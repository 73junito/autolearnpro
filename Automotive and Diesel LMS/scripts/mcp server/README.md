# Course MCP Server

This folder contains the MCP (Model Context Protocol) server for course content generation.

Quick guide: build the TypeScript, create a Docker image, and run the server attached to stdio.

Prerequisites
- Node.js 20 (recommended for Docker image; development Node >= 18 is fine)
- Docker (for container runs)

Build locally
```powershell
cd "D:\Automotive and Diesel LMS\scripts\mcp server"
npm ci
npm run build
node build/index.js
```

Run in Docker (recommended)
```powershell
cd "D:\Automotive and Diesel LMS\scripts\mcp server"
docker build -t course-mcp-server .
docker run -it --rm course-mcp-server
```

Run with Docker Compose
```powershell
cd "D:\Automotive and Diesel LMS\scripts\mcp server"
docker compose up --build
```

Wrapper (PowerShell)
```powershell
.
# or
./run-mcp.ps1
```

Notes
- MCP servers communicate over `stdin`/`stdout` — do not run the container detached if you need interactive stdio.
- The Dockerfile uses a multi-stage build to produce a small runtime image (Node 20).
- If you see module resolution errors about deep ESM imports, ensure `tsconfig.json` uses `module: NodeNext` and `moduleResolution: NodeNext` and rebuild.

Troubleshooting
- If `node build/index.js` fails with `ERR_MODULE_NOT_FOUND` referencing `dist/esm`, clean the build and rebuild:
```powershell
rd /s /q build 2>$null; npm run build
```
- If running in Docker you can inspect inside the container:
```powershell
docker run -it --rm course-mcp-server sh
node build/index.js
```

Next steps
- (Optional) push `course-mcp-server` to a container registry (GHCR, Docker Hub).
- (Optional) I can add a small MCP client example or wire this into your Claude/agent config.
# Course Content Generator MCP Server

This is a Model Context Protocol (MCP) server that integrates Stable Diffusion for image generation and Ollama for text generation. It provides tools to generate thumbnails and text descriptions for courses.

## Features

- **Generate Course Descriptions**: Uses Ollama LLM to create compelling course descriptions.
- **Generate Course Thumbnails**: Uses Stable Diffusion via Hugging Face to create professional course thumbnail images.

## Prerequisites

- Node.js 18 or higher
- Ollama installed and running locally
- Stable Diffusion WebUI installed and running on localhost:7860 (API enabled)

## Installation

1. Clone or download this project.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Configuration

- Ensure Ollama is running with the `llama3.2` model installed.
- Ensure Stable Diffusion WebUI is running on localhost:7860 with API enabled.
- Copy `config.template.json` to `config.json` and adjust settings as needed.

## Usage

Run the MCP server:
```bash
node build/index.js
```

The server communicates via stdio and can be integrated with MCP-compatible clients like Claude Desktop.

## MCP Configuration

Add to your MCP client configuration (e.g., Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "course-content-generator": {
      "command": "node",
      "args": ["/path/to/build/index.js"]
    }
  }
}
```

## Tools

### generate_course_description
Generates a text description for a course.

Parameters:
- `title` (string): Course title
- `topic` (string, optional): Course topic

### generate_course_thumbnail
Generates an image thumbnail for a course using local Stable Diffusion WebUI.

Parameters:
- `title` (string): Course title
- `topic` (string, optional): Course topic
- `style` (string, optional): Image style (default: "realistic")

## Development

- Source code: `src/index.ts`
- Build output: `build/index.js`
- Configuration: `tsconfig.json`

## License

[Add license information]</content>
<parameter name="filePath">d:\Automotive and Diesel LMS\scripts\mcp server\README.md