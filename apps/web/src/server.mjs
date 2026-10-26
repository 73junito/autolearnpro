import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createRoleApproval } from "./role-approval.mjs";

export function makeServer(options = {}) {
  const approval = options.approval ?? createRoleApproval(options);
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path.startsWith("/api/roles/")) {
      void approval.process(req, res);
      return;
    }
    if (req.method !== "GET" || req.url !== "/health") {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ status: "ok", service: "autolearnpro-web" }));
  });
  server.on("close", () => { void approval.close?.(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("Invalid PORT");
    process.exitCode = 1;
  } else {
    makeServer().listen(port, "127.0.0.1", () => console.log(`AutoLearnPro web server listening on 127.0.0.1:${port}`));
  }
}
