const fs = require('fs').promises;
const https = require('https');
const http = require('http');

async function findPort() {
  try {
    const txt = await fs.readFile('mcp_http_port.txt', 'utf8');
    const p = Number(txt.trim());
    if (p && Number.isInteger(p)) return p;
  } catch (_) {}
  const candidates = [5005,5006,5007,5010,5020];
  return candidates[0];
}

function fetchText(url, timeout = 8000) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: tryParseJson(data) }));
    });
    req.on('error', (e) => resolve({ error: String(e) }));
    req.setTimeout(timeout, () => { req.destroy(new Error('timeout')); });
  });
}

function tryParseJson(s) {
  try { return JSON.parse(s); } catch (_) { return s; }
}

(async () => {
  const port = await findPort();
  console.log('Using port:', port);
  const base = `http://localhost:${port}`;
  const endpoints = ['/theme','/tools','/make-og-png'];
  for (const ep of endpoints) {
    const url = base + ep;
    process.stdout.write(`\n== GET ${ep} ==\n`);
    const r = await fetchText(url, 8000);
    console.log(JSON.stringify(r, null, 2));
  }

  // POST /generate-course with AUT-120 data and save result
  const coursePayload = {
    courseCode: "AUT-120",
    title: "Brake Systems (ASE A5)",
    credits: 4,
    hours: 60,
    level: "Lower Division",
    description: "Comprehensive course covering hydraulic and electronic brake systems including ABS, traction control, and stability systems. Covers disc and drum brakes, master cylinder operation, and diagnostic procedures.",
    outcomes: [
      "Demonstrate safe and professional shop practices",
      "Identify and explain key system components and operation",
      "Perform systematic diagnostic procedures",
      "Apply industry-standard service and repair techniques",
      "Interpret technical data and service information"
    ]
  };

  process.stdout.write('\n== POST /generate-course ==\n');
  try {
    const postUrl = base + '/generate-course';
    const postRes = await new Promise((resolve, reject) => {
      const req = http.request(postUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', (e) => reject(e));
      req.write(JSON.stringify(coursePayload));
      req.end();
    });
    console.log('POST status:', postRes.status);
    await fs.mkdir('../docs/course_pages', { recursive: true }).catch(() => {});
    await fs.writeFile('../docs/course_pages/AUT-120.generated.html', postRes.body, 'utf8');
    console.log('Saved generated HTML to ../docs/course_pages/AUT-120.generated.html');
  } catch (e) {
    console.error('POST error:', e);
  }
})();
