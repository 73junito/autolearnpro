// Deployment-safe placeholder. Does not import the privileged Node approval service.
export default {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (request.method === "GET" && pathname === "/health") {
      return Response.json({ status: "ok", service: "autolearnpro-foundation-cloudflare", mode: "scaffold" }, {
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" }
      });
    }
    return Response.json({ error: "not_found" }, {
      status: 404, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" }
    });
  }
};
