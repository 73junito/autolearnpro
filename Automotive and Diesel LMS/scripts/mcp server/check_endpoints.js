const fs = require('fs').promises;
const { AbortController } = require('abort-controller');

async function findPort() {
  try {
    const txt = await fs.readFile('mcp_http_port.txt', 'utf8');
    const p = Number(txt.trim());
    if (p && Number.isInteger(p)) return p;
  } catch (_) {}
  const candidates = [5005,5006,5007,5010,5020];
  return candidates[0];
}

async function get(url, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch (_) {}
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err) {
    return { error: String(err) };
  } finally {
    clearTimeout(id);
  }
}

(async () => {
  const port = await findPort();
  console.log('Using port:', port);
  const base = `http://localhost:${port}`;
  const endpoints = ['/theme','/tools','/make-og-png'];
  for (const ep of endpoints) {
    const url = base + ep;
    process.stdout.write(`\n== GET ${ep} ==\n`);
    const r = await get(url, 8000);
    console.log(JSON.stringify(r, null, 2));
  }
})();
