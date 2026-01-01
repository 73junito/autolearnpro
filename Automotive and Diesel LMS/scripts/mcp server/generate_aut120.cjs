const fs = require('fs').promises;
const http = require('http');

async function findPort() {
  try {
    const txt = await fs.readFile('mcp_http_port.txt', 'utf8');
    const p = Number(txt.trim());
    if (p && Number.isInteger(p)) return p;
  } catch (_) {}
  return 5005;
}

async function postJson(url, obj, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(obj);
    const u = new URL(url);
    const req = http.request({ method: 'POST', hostname: u.hostname, port: u.port, path: u.pathname, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

(async () => {
  const port = await findPort();
  const url = `http://localhost:${port}/generate-course`;
  const payload = {
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

  try {
    console.log('Posting to', url);
    const res = await postJson(url, payload, 15000);
    console.log('Status:', res.status);
    const outPath = 'docs/course_pages/AUT-120.generated.html';
    await fs.mkdir('docs/course_pages', { recursive: true });
    await fs.writeFile(outPath, res.body, 'utf8');
    console.log('Saved generated HTML to', outPath);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(2);
  }
})();
