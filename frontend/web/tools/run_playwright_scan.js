#!/usr/bin/env node
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const cwd = path.resolve(__dirname, '..');

function waitForServer(url, attempts = 40, delay = 500) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) return resolve();
        retry();
      });
      req.on('error', retry);
      function retry() {
        i++;
        if (i >= attempts) return reject(new Error('Server did not become ready'));
        setTimeout(tryOnce, delay);
      }
    };
    tryOnce();
  });
}

(async () => {
  console.log('Starting Next.js production server (npm start)...');
  const server = spawn('npm', ['run', 'start'], { cwd, shell: true, stdio: 'inherit' });

  process.on('exit', () => {
    try { server.kill(); } catch (e) {}
  });

  try {
    await waitForServer('http://localhost:3000/');
    console.log('Server is up. Running Playwright scan...');

    // Allow optional path argument: node run_playwright_scan.js / or /courses
    const pathArg = process.argv[2] || '/courses';
    const targetUrl = `http://localhost:3000${pathArg}`;
    const outFile = process.argv[3] || 'a11y-playwright.json';

    const scan = spawn('node', ['tools/a11y_playwright.js', targetUrl, outFile], { cwd, shell: true, stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      scan.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Scan failed')));
    });

    console.log('Scan finished. Shutting down server.');
  } catch (err) {
    console.error('Error during run:', err.message || err);
  } finally {
    try { server.kill(); } catch (e) {}
  }
})();
