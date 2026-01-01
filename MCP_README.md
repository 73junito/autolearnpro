# LMS AI MCP Server

This is an MCP (Model Context Protocol) server that provides tools for generating course thumbnails using Stable Diffusion WebUI and course descriptions using Ollama, specifically tailored for the Automotive and Diesel LMS.

## Prerequisites

- Node.js 18+
- Stable Diffusion WebUI running with API enabled (http://127.0.0.1:7861)
- Ollama running (http://localhost:11434)

## Installation

```bash
npm install
npm run build
```

## Usage

Run the server:

```bash
npm start
```

Or directly:

```bash
node build/index.js
```

## Security Features

- **Input Validation**: All inputs are validated with length limits and type checking
- **Rate Limiting**: 10 requests per minute per tool to prevent abuse
- **API Key Authentication**: Optional API key support via environment variable
- **Environment Configuration**: Configurable API URLs via .env file
- **Error Handling**: Comprehensive error logging and safe error responses
- **Local Access Only**: Server runs locally, limiting external access risks

## Configuration

Create a `.env` file in the project root:

```env
# API URLs for external services
SD_API_URL=http://127.0.0.1:7861
OLLAMA_API_URL=http://localhost:11434

# Optional API key for additional security
MCP_API_KEY=your-secret-key-here
```

## Tools

### generate_course_thumbnail

Generates a professional thumbnail image for a course using Stable Diffusion.

Parameters:
- course_title: string (required, 1-200 chars) - The title of the course
- style: string (optional, max 100 chars, default "modern technical") - Style description for the image
- width: number (optional, 256-1024, default 512) - Image width
- height: number (optional, 256-1024, default 512) - Image height
- steps: number (optional, 5-50, default 20) - Number of generation steps
- api_key: string (optional) - API key if authentication is enabled

### generate_course_description

Generates a compelling course description using Ollama.

Parameters:
- course_title: string (required, 1-200 chars) - The title of the course
- course_details: string (optional, max 500 chars) - Additional details about the course
- model: string (optional, max 50 chars, default "llama3.1") - The Ollama model to use
- api_key: string (optional) - API key if authentication is enabled

## Configuration

To use with Claude Desktop, add to your claude_desktop_config.json:

```json
{
  "mcpServers": {
    "sd-ollama": {
      "command": "node",
      "args": ["/path/to/build/index.js"]
    }
  }
}
```