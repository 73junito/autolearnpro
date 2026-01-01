import { z } from "zod";
import { Ollama } from "ollama";
import fs from "fs/promises";
import path from "path";

// Simple tool registry so we can expose tools via the Server request handlers
type ToolHandler = (args: any) => Promise<any> | any;
const tools: Map<string, { title?: string; description?: string; inputSchema?: z.ZodTypeAny; handler: ToolHandler }> = new Map();

function registerTool(name: string, config: { title?: string; description?: string; inputSchema?: z.ZodTypeAny }, handler: ToolHandler) {
  tools.set(name, { title: config.title, description: config.description, inputSchema: config.inputSchema, handler });
}

// Initialize clients
const ollama = new Ollama();

// Tool: Generate course description using Ollama
registerTool(
  "generate_course_description",
  {
    title: "Generate Course Description",
    description: "Generate a compelling text description for a course using Ollama LLM",
    inputSchema: z.object({
      title: z.string().describe("Course title"),
      topic: z.string().optional().describe("Course topic or subject")
    })
  },
  async ({ title, topic }: { title: string; topic?: string }) => {
    try {
      const prompt = `Generate a compelling and detailed course description for a course titled "${title}"${topic ? ` on the topic of ${topic}` : ''}. Make it engaging, informative, and suitable for an LMS platform.`;
      const response = await ollama.generate('llama3.2', prompt);
      let fullResponse = '';
      for await (const part of response) {
        fullResponse += part;
      }
      return {
        content: [{ type: "text", text: fullResponse }]
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{ type: "text", text: `Error generating description: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Generate a full HTML course page from structured input
registerTool(
  "generate_course_page",
  {
  title: "Generate Course Page",
  description: "Generate a full HTML course page for an LMS from structured course data",
  inputSchema: z.object({
    courseCode: z.string(),
    title: z.string(),
    credits: z.number().optional(),
    hours: z.number().optional(),
    level: z.string().optional(),
    description: z.string().optional(),
    outcomes: z.array(z.string()).optional()
  })
  },
  async (args: any) => {
  const { courseCode, title, credits, hours, level, description = '', outcomes = [] } = args || {};
  const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const outcomeList = Array.isArray(outcomes) && outcomes.length
    ? outcomes.map((o: string) => `                <li>${esc(o)}</li>`).join('\n')
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(courseCode)} - ${esc(title)} | Automotive & Diesel LMS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; padding: 40px; }
    .course-code { font-size: 1.2em; font-weight: 600; opacity: 0.9; margin-bottom: 10px; }
    .course-title { font-size: 2.5em; font-weight: 700; margin-bottom: 20px; line-height: 1.2; }
    .course-meta { display: flex; gap: 30px; flex-wrap: wrap; font-size: 0.95em; }
    .meta-item { display: flex; align-items: center; gap: 8px; }
    .content { padding: 40px; }
    .section { margin-bottom: 35px; }
    .section-title { font-size: 1.5em; color: #1e3c72; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 3px solid #667eea; }
    .description { font-size: 1.1em; line-height: 1.8; color: #555; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
    .info-card { background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #667eea; }
    .info-label { font-weight: 600; color: #1e3c72; margin-bottom: 5px; font-size: 0.9em; text-transform: uppercase; }
    .info-value { font-size: 1.2em; color: #333; }
    .badge { display: inline-block; padding: 8px 16px; background: #667eea; color: white; border-radius: 20px; font-size: 0.9em; font-weight: 600; margin-top: 10px; }
    .btn { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; font-weight: 600; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <a href="/" class="back-link">← Back to Catalog</a>
      <div class="course-code">${esc(courseCode)}</div>
      <h1 class="course-title">${esc(title)}</h1>
      <div class="course-meta">
        <div class="meta-item"><span class="meta-icon">📚</span><span>${esc(credits)}</span></div>
        <div class="meta-item"><span class="meta-icon">⏱️</span><span>${esc(hours)}</span></div>
        <div class="meta-item"><span class="meta-icon">📍</span><span>${esc(level)}</span></div>
      </div>
    </div>
    <div class="content">
      <div class="section">
        <h2 class="section-title">Course Description</h2>
        <p class="description">${esc(description)}</p>
        <span class="badge">${esc(level || 'Course')}</span>
      </div>
      <div class="info-grid">
        <div class="info-card"><div class="info-label">Credits</div><div class="info-value">${esc(credits)}</div></div>
        <div class="info-card"><div class="info-label">Duration</div><div class="info-value">${esc(hours)} Hours</div></div>
        <div class="info-card"><div class="info-label">Course Level</div><div class="info-value">${esc(level)}</div></div>
      </div>
      <div class="section">
        <h2 class="section-title">Learning Outcomes</h2>
        <p class="description">Upon successful completion of this course, students will be able to:</p>
        <ul style="margin-top: 15px; margin-left: 25px; line-height: 2;">
${outcomeList}
        </ul>
      </div>
      <a href="/" class="btn">View All Courses</a>
    </div>
  </div>
</body>
</html>`;

  return { content: [{ type: 'text', text: html }] } as any;
  }
);

// Tool: Generate course thumbnail using Stable Diffusion via Hugging Face
registerTool(
  "generate_course_thumbnail",
  {
    title: "Generate Course Thumbnail",
    description: "Generate an image thumbnail for a course using Stable Diffusion",
    inputSchema: z.object({
      title: z.string().describe("Course title"),
      topic: z.string().optional().describe("Course topic or subject"),
      style: z.string().default("realistic").describe("Image style (e.g., realistic, cartoon, abstract)")
    })
  },
  async ({ title, topic, style = "realistic" }: { title: string; topic?: string; style?: string }) => {
    try {
      const prompt = `Create a professional course thumbnail image for "${title}"${topic ? ` about ${topic}` : ''}. Style: ${style}. Educational, clean design, suitable for LMS.`;
      const response = await fetch('http://localhost:7860/sdapi/v1/txt2img', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          steps: 20,
          width: 512,
          height: 512,
          cfg_scale: 7,
          sampler_name: 'Euler a',
        }),
      });

      if (!response.ok) {
        throw new Error(`Stable Diffusion API error: ${response.statusText}`);
      }

      const data = await response.json();
      const base64 = data.images[0];

      return {
        content: [{
          type: "image",
          mimeType: "image/png",
          data: base64
        }]
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{ type: "text", text: `Error generating thumbnail: ${err.message}. Make sure Stable Diffusion WebUI is running on localhost:7860.` }],
        isError: true
      };
    }
  }
);

// Tool: Provide homepage theme settings (JSON) for the frontend
registerTool(
  "get_homepage_theme",
  {
    title: "Get Homepage Theme",
    description: "Return JSON theme settings for the homepage (colors, accents, spacing)",
  },
  async (_args: {}) => {
    // Return a theme that mirrors the dark-first CSS variables used in the frontend
    return {
      content: [
        {
          type: "json",
          data: {
            mode: "dark",
            variables: {
              "--bg-start-rgb": "6,10,20",
              "--bg-end-rgb": "12,25,56",
              "--accent-rgb": "6,182,212",
              "--foreground-rgb": "255,255,255"
            },
            hero: {
              gradientIntensity: 0.12
            },
            buttons: {
              primary: {
                gradient: ["rgba(6,182,212,1)", "rgba(0,118,255,1)"]
              }
            }
          }
        }
      ]
    } as any;
  }
);

// Tool: Generate a theme image using Stable Diffusion and save to frontend public images
registerTool(
  "generate_theme_image",
  {
    title: "Generate Theme Image",
    description: "Generate a homepage theme/background image using Stable Diffusion and save it to frontend/public/images",
    inputSchema: z.object({
      prompt: z.string().optional(),
      mood: z.string().optional(),
      palette: z.string().optional(),
      style: z.string().default("cinematic"),
      width: z.number().optional(),
      height: z.number().optional(),
      filename: z.string().optional()
    })
  },
  async ({ prompt, mood, palette, style, width = 1200, height = 512, filename }: any) => {
    try {
      const finalPrompt = prompt ?? `A ${style} abstract background for an educational LMS homepage` + (mood ? `, mood: ${mood}` : '') + (palette ? `, colors: ${palette}` : '');

      const resp = await fetch('http://localhost:7860/sdapi/v1/txt2img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt, steps: 28, width, height, cfg_scale: 7, sampler_name: 'Euler a' })
      });

      if (!resp.ok) throw new Error(`Stable Diffusion API error: ${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      const base64 = data.images && data.images[0];
      if (!base64) throw new Error('No image returned from SD WebUI');

      const imagesDir = path.join(process.cwd(), 'frontend', 'web', 'public', 'images');
      await fs.mkdir(imagesDir, { recursive: true });
      const outName = filename ? filename : `theme-${Date.now()}.png`;
      const outPath = path.join(imagesDir, outName);
      const buffer = Buffer.from(base64, 'base64');
      await fs.writeFile(outPath, buffer);

      return { content: [{ type: 'image', mimeType: 'image/png', url: `/images/${outName}` }] } as any;
    } catch (err) {
      const e = err as Error;
      return { content: [{ type: 'text', text: `Error generating theme image: ${e.message}. Ensure SD WebUI is running on localhost:7860.` }], isError: true } as any;
    }
    }
  );

// Tool: Generate multimodal lesson content using Ollama
registerTool(
  "generate_multimodal_lesson",
  {
    title: "Generate Multimodal Lesson",
    description: "Generate written steps, audio script, practice activities and visual diagram specs for a lesson using Ollama",
    inputSchema: z.object({
      course: z.string().describe('Course slug or title'),
      module: z.string().describe('Module slug or title'),
      lesson_title: z.string().describe('Lesson title'),
      lesson_type: z.string().optional().describe('lesson or lab'),
      duration: z.number().optional().describe('Estimated minutes')
    })
  },
  async ({ course, module, lesson_title, lesson_type = 'lesson', duration = 0 }: any) => {
    try {
      const prompt = `You are a technical instructional designer. Generate multimodal lesson content for the lesson described below. Return ONLY a JSON object with keys: written_steps (markdown string), audio_script (plain text), practice_activities (JSON array), visual_diagrams (JSON array).\n\nLesson metadata:\n- course: ${course}\n- module: ${module}\n- lesson_title: ${lesson_title}\n- lesson_type: ${lesson_type}\n- duration_minutes: ${duration}\n\nRequirements:\n- written_steps should be 6-12 numbered steps in markdown with safety and verification checklist.\n- audio_script should be a 90-180 second instructor script (conversational).\n- practice_activities should be an array of 1-2 scenario objects with fields: type, title, description, questions (array).\n- visual_diagrams should be an array of 0-2 objects describing diagrams (type, description, labels).\n\nOutput JSON only. No extra text.`;

      const response = await ollama.generate('llama3.2', prompt);
      let full = '';
      for await (const part of response) {
        full += part;
      }

      // Attempt to extract JSON object from model output
      let parsed: any = null;
      try {
        parsed = JSON.parse(full);
      } catch (e) {
        // fallback: try to find first {...} block
        const m = full.match(/\{[\s\S]*\}/);
        if (m) {
          try { parsed = JSON.parse(m[0]); } catch (err) { parsed = null; }
        }
      }

      if (!parsed) {
        return { content: [{ type: 'text', text: `Failed to parse model output as JSON. Raw output:\n${full.slice(0,2000)}` }], isError: true };
      }

      return { content: [{ type: 'json', data: parsed }] } as any;
    } catch (error) {
      const err = error as Error;
      return { content: [{ type: 'text', text: `Error generating multimodal lesson: ${err.message}` }], isError: true };
    }
  }
);

// Start the server
async function main() {
  // Wire up handlers for basic MCP requests (list tools and call tool)
  // import types dynamically; ignore TS module checking here to avoid deep-subpath resolution issues
  let hasSdk = true;
  let CallToolRequestSchema: any = null;
  let ListToolsRequestSchema: any = null;
  let server: any = null;
  try {
     // Import the SDK package and access its exports via the package entrypoint
     // This avoids hard-coded paths that can lead to duplicated segments like `dist/dist/...`
     // @ts-ignore
     const sdkPkg: any = await import("@modelcontextprotocol/sdk");
     CallToolRequestSchema = sdkPkg.CallToolRequestSchema ?? sdkPkg.types?.CallToolRequestSchema ?? sdkPkg.default?.types?.CallToolRequestSchema;
     ListToolsRequestSchema = sdkPkg.ListToolsRequestSchema ?? sdkPkg.types?.ListToolsRequestSchema ?? sdkPkg.default?.types?.ListToolsRequestSchema;
     const ServerCtor = sdkPkg.Server ?? sdkPkg.server?.Server ?? sdkPkg.default?.Server;
     const StdioServerTransport = sdkPkg.StdioServerTransport ?? sdkPkg.server?.StdioServerTransport ?? sdkPkg.default?.StdioServerTransport;
     const transport = new StdioServerTransport();

     // create server instance with tools capability
     server = new ServerCtor({ name: "course-content-generator", version: "1.0.0" }, { capabilities: { tools: {} } });

    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const toolList = Array.from(tools.entries()).map(([name, t]) => ({ name, title: t.title, description: t.description }));
      return { tools: toolList } as any;
    });

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const name = request.params.name;
      const tool = tools.get(name);
      if (!tool) {
        return { error: `Tool not found: ${name}` } as any;
      }
      let args: any = {};
      if (tool.inputSchema) {
        args = tool.inputSchema.parse(request.params.args || {});
      } else {
        args = request.params.args || {};
      }
      const result = await tool.handler(args);
      return result as any;
    });

    await server.connect(transport);
    console.error("Course Content Generator MCP Server running on stdio");
  } catch (err) {
    hasSdk = false;
    console.error("MCP SDK import or server initialization failed — starting HTTP-only bridge. Error:", (err as any)?.message ?? String(err));
  }

  // Small HTTP bridge to expose theme and tool-list endpoints for local frontend consumption
  // This does not replace the MCP stdio transport — it simply exposes a convenience HTTP API.
  const http = await import("node:http");
  const portStart = process.env.MCP_HTTP_PORT ? Number(process.env.MCP_HTTP_PORT) : 5005;
  const maxTries = 16;

  // helper: check TCP port availability
  const net = await import("node:net");
  async function findAvailablePort(start: number, tries: number) {
    for (let i = 0; i < tries; i++) {
      const p = start + i;
      // attempt to listen and immediately close
      const canUse = await new Promise<boolean>((resolve) => {
        const tester = net.createServer()
          .once('error', () => { resolve(false); })
          .once('listening', () => {
            tester.close(() => resolve(true));
          })
          .listen(p, '127.0.0.1');
      });
      if (canUse) return p;
    }
    throw new Error(`No available port in range ${start}-${start + tries - 1}`);
  }

  const chosenPort = await findAvailablePort(portStart, maxTries);
  // persist chosen port to a small file so dev tooling can pick it up if needed
  try {
    const p = await import("node:fs/promises");
    const outPath = path.join(process.cwd(), 'scripts', 'mcp server', 'mcp_http_port.txt');
    await p.writeFile(outPath, String(chosenPort), 'utf8').catch(() => {});
  } catch (e) {
    // ignore write failures
  }

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.writeHead(404);
        return res.end();
      }

      // Lightweight health endpoint for monitoring
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", pid: process.pid }));
        return;
      }

      // GET /make-og-png -> try SD generator tool, fallback to convert SVG to PNG using sharp
      if (req.url === "/make-og-png" && req.method === "GET") {
        try {
          // prefer using the generate_theme_image tool if available
          const genTool = tools.get('generate_theme_image');
          if (genTool) {
            const result: any = await genTool.handler({ prompt: 'Cinematic automotive workshop, cinematic lighting, teal highlights', width: 1200, height: 630, filename: 'og-homepage.png' });
            const imageBlock = Array.isArray(result?.content) ? result.content.find((c: any) => c.type === 'image' && c.url) : null;
            if (imageBlock && imageBlock.url) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ url: imageBlock.url, source: 'sd' }));
              return;
            }
          }

          // Fallback: convert existing SVG to PNG using sharp
          let sharpLib: any = null;
          try { sharpLib = await import('sharp'); } catch (e) { sharpLib = null; }
          const svgPath = path.join(process.cwd(), 'frontend', 'web', 'public', 'images', 'og-homepage.svg');
          const outPath = path.join(process.cwd(), 'frontend', 'web', 'public', 'images', 'og-homepage.png');
          try {
            const svgExists = await fs.stat(svgPath).then(() => true).catch(() => false);
            if (!svgExists) throw new Error('SVG fallback not found');
            const svgBuffer = await fs.readFile(svgPath);
            if (!sharpLib) throw new Error('sharp not installed. Run `npm install sharp` in the MCP server folder or globally');
            const pngBuffer = await sharpLib.default(svgBuffer).png({ quality: 90 }).toBuffer();
            await fs.writeFile(outPath, pngBuffer);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: '/images/og-homepage.png', source: 'svg-convert' }));
            return;
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(e) }));
            return;
          }
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
          return;
        }
      }
      // POST /generate-theme-image -> call the generate_theme_image tool, save image, return URL
      if (req.url === "/generate-theme-image" && req.method === "POST") {
        try {
          const chunks: Uint8Array[] = [];
          for await (const chunk of req) chunks.push(chunk as Uint8Array);
          const body = Buffer.concat(chunks).toString('utf8') || '{}';
          const payload = JSON.parse(body);
          const tool = tools.get('generate_theme_image');
          if (!tool) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'generate_theme_image tool not available' }));
            return;
          }
          const result: any = await tool.handler(payload || {});
          const imageBlock = Array.isArray(result?.content) ? result.content.find((c: any) => c.type === 'image' && c.url) : null;
          const url = imageBlock ? imageBlock.url : null;
          res.writeHead(result?.isError ? 500 : 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ url, raw: result }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        }
        return;
      }

      // POST /generate-course -> call the generate_course_page tool and return HTML
      if (req.url === "/generate-course" && req.method === "POST") {
        try {
          const chunks: Uint8Array[] = [];
          for await (const chunk of req) chunks.push(chunk as Uint8Array);
          const body = Buffer.concat(chunks).toString('utf8') || '{}';
          const payload = JSON.parse(body);
          const tool = tools.get('generate_course_page');
          if (!tool) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'generate_course_page tool not available' }));
            return;
          }
          const result: any = await tool.handler(payload || {});
          const textBlock = Array.isArray(result?.content) ? result.content.find((c: any) => c.type === 'text') : null;
          const html = textBlock ? textBlock.text : (typeof result === 'string' ? result : JSON.stringify(result));
          res.writeHead(result?.isError ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        }
        return;
      }

      // POST /generate-multimodal-lesson -> call the generate_multimodal_lesson tool and return JSON
      if (req.url === "/generate-multimodal-lesson" && req.method === "POST") {
        try {
          const chunks: Uint8Array[] = [];
          for await (const chunk of req) chunks.push(chunk as Uint8Array);
          const body = Buffer.concat(chunks).toString('utf8') || '{}';
          const payload = JSON.parse(body);
          const tool = tools.get('generate_multimodal_lesson');
          if (!tool) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'generate_multimodal_lesson tool not available' }));
            return;
          }
          const result: any = await tool.handler(payload || {});
          // If tool returned json content block, extract it
          const jsonBlock = Array.isArray(result?.content) ? result.content.find((c: any) => c.type === 'json') : null;
          const data = jsonBlock ? jsonBlock.data : result;
          res.writeHead(result?.isError ? 500 : 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: data, raw: result }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        }
        return;
      }

      if (req.url === "/theme") {
        const tool = tools.get("get_homepage_theme");
        if (!tool) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "theme tool not available" }));
          return;
        }
        const result: any = await tool.handler({});
        // Extract JSON content block if present
        const jsonBlock = Array.isArray(result?.content) ? result.content.find((c: any) => c.type === "json") : null;
        const payload = jsonBlock ? jsonBlock.data : result;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
        return;
      }

      if (req.url === "/tools") {
        const toolList = Array.from(tools.entries()).map(([name, t]) => ({ name, title: t.title, description: t.description }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ tools: toolList }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  httpServer.listen(chosenPort, () => {
    console.error(`MCP HTTP bridge listening on http://localhost:${chosenPort}`);
  });
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});