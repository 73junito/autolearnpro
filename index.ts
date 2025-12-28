import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const SD_API_URL = process.env.SD_API_URL || "http://127.0.0.1:7861";
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434";
const MCP_API_KEY = process.env.MCP_API_KEY; // Optional API key for additional security

// Simple rate limiter: max 10 requests per minute per tool
const rateLimit = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;

function checkRateLimit(toolName: string): boolean {
  const now = Date.now();
  const key = toolName;
  const entry = rateLimit.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimit.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

const server = new McpServer({
  name: "lms-ai-server",
  version: "1.0.0",
});

server.registerTool(
  "generate_course_thumbnail",
  {
    description: "Generate a professional thumbnail image for a course using Stable Diffusion",
    inputSchema: z.object({
      course_title: z.string().min(1, "Course title cannot be empty").max(200, "Course title too long"),
      style: z.string().max(100, "Style description too long").default("modern technical"),
      width: z.number().min(256).max(1024).default(512),
      height: z.number().min(256).max(1024).default(512),
      steps: z.number().min(5).max(50).default(20),
      api_key: z.string().optional(),
    }),
  },
  async ({ course_title, style, width, height, steps, api_key }) => {
    if (MCP_API_KEY && api_key !== MCP_API_KEY) {
      console.error(`Invalid API key provided`);
      return {
        content: [{ type: "text", text: "Invalid API key." }],
        isError: true,
      };
    }

    if (!checkRateLimit("generate_course_thumbnail")) {
      console.error(`Rate limit exceeded for generate_course_thumbnail`);
      return {
        content: [{ type: "text", text: "Rate limit exceeded. Please try again later." }],
        isError: true,
      };
    }

    console.error(`Generating thumbnail for course: ${course_title}`);
    
    const prompt = `Create a professional, educational thumbnail image for an automotive and diesel course titled: "${course_title}". Style: ${style}, appealing to mechanics and technicians, high quality, detailed.`;
    const negative_prompt = "blurry, low quality, text, watermark, ugly, deformed";

    try {
      const response = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negative_prompt,
          width,
          height,
          steps,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`SD API error: ${response.status} - ${errorText}`);
        throw new Error(`SD API error: ${response.statusText}`);
      }

      const data = await response.json();
      const imageBase64 = data.images[0];

      console.error(`Thumbnail generated successfully for: ${course_title}`);
      return {
        content: [
          {
            type: "text",
            text: `Thumbnail generated for "${course_title}". Base64 image data: ${imageBase64}`,
          },
        ],
      };
    } catch (error) {
      const err = error as Error;
      console.error(`Error generating thumbnail: ${err.message}`);
      return {
        content: [{ type: "text", text: `Error generating thumbnail: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "generate_course_description",
  {
    description: "Generate a compelling course description using Ollama",
    inputSchema: z.object({
      course_title: z.string().min(1, "Course title cannot be empty").max(200, "Course title too long"),
      course_details: z.string().max(500, "Course details too long").default(""),
      model: z.string().max(50, "Model name too long").default("llama3.1"),
      api_key: z.string().optional(),
    }),
  },
  async ({ course_title, course_details, model, api_key }) => {
    if (MCP_API_KEY && api_key !== MCP_API_KEY) {
      console.error(`Invalid API key provided`);
      return {
        content: [{ type: "text", text: "Invalid API key." }],
        isError: true,
      };
    }

    if (!checkRateLimit("generate_course_description")) {
      console.error(`Rate limit exceeded for generate_course_description`);
      return {
        content: [{ type: "text", text: "Rate limit exceeded. Please try again later." }],
        isError: true,
      };
    }

    console.error(`Generating description for course: ${course_title} using model: ${model}`);
    
    const prompt = `Write a compelling and professional course description for: "${course_title}". ${course_details ? `Additional details: ${course_details}.` : ''} Include what students will learn, prerequisites if any, and the benefits of taking this course. Make it engaging and informative.`;

    try {
      const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Ollama API error: ${response.status} - ${errorText}`);
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();

      console.error(`Description generated successfully for: ${course_title}`);
      return {
        content: [{ type: "text", text: data.response }],
      };
    } catch (error) {
      const err = error as Error;
      console.error(`Error generating description: ${err.message}`);
      return {
        content: [{ type: "text", text: `Error generating description: ${err.message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LMS AI MCP Server running on stdio - Stable Diffusion and Ollama integration");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});