// C3-R34 — catalog skeleton boundary tests.
//
// Static inspection of the application contract, plus one real local build. Nothing here is a synthetic
// fixture standing in for an automotive catalog: the subject is a four-file skeleton, and passing these
// tests proves the *boundaries* hold, not that a catalog exists.
//
// Run with: node --test tests/c3-catalog-skeleton.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const APP = path.join(root, 'apps', 'catalog');
const APP_REL = 'apps/catalog';
const TOOLCHAIN = path.join(root, 'infrastructure', 'c3', 'build');
const DIST = path.join(APP, 'dist');
const VITE_BIN = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (file) => path.relative(root, file).split(path.sep).join('/');

function walk(dir, filter = () => true) {
  const out = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (filter(abs)) out.push(abs);
    }
  };
  if (fs.existsSync(dir)) visit(dir);
  return out.sort();
}

/**
 * Strip comments before matching code patterns, so a rule cannot be satisfied — or broken — by prose.
 * Comments are often the only place a banned word legitimately appears ("we do not use innerHTML").
 */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const srcFiles = () => walk(path.join(APP, 'src'), (file) => file.endsWith('.js'));
const appFiles = (extensions) =>
  walk(APP, (file) => extensions.test(file) && !file.startsWith(DIST + path.sep));

// A file-tree digest with sizes, so two builds can be compared for byte-identical output.
const digestTree = (dir) =>
  walk(dir).map((file) => [
    path.relative(dir, file).split(path.sep).join('/'),
    sha256(fs.readFileSync(file)),
    fs.statSync(file).size
  ]);

function viteBuild() {
  return execFileSync(process.execPath, [VITE_BIN, 'build', '--logLevel', 'warn'], {
    cwd: APP,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

test('1. the catalog manifest declares exactly the approved dependency set', () => {
  const pkg = readJson(path.join(APP, 'package.json'));

  assert.equal(pkg.name, '@autolearnpro/catalog');
  assert.equal(pkg.private, true, 'a workspace app must not be publishable');
  assert.equal(pkg.type, 'module');

  // Exactly one runtime dependency and one build dependency. Not "at least" — exactly.
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['three']);
  assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), ['vite']);
  assert.equal(pkg.peerDependencies ?? null, null);
  assert.equal(pkg.optionalDependencies ?? null, null);

  assert.equal(pkg.dependencies.three, '0.180.0');
  assert.equal(pkg.devDependencies.vite, '7.3.7');
  for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.match(spec, /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly, saw ${spec}`);
  }

  for (const banned of ['react', 'react-dom', '@react-three/fiber', '@react-three/drei', '@vitejs/plugin-react', 'typescript', 'jsdom', 'esbuild']) {
    assert.equal(Object.hasOwn({ ...pkg.dependencies, ...pkg.devDependencies }, banned), false, `${banned} must not be declared`);
  }

  // The only script is the build. Nothing installs, publishes or deploys.
  assert.deepEqual(Object.keys(pkg.scripts ?? {}), ['build']);
  assert.equal(pkg.scripts.build, 'vite build');
});

test('2. the app bundler pin equals the isolated R30 toolchain pin', () => {
  const app = readJson(path.join(APP, 'package.json'));
  const toolchain = readJson(path.join(TOOLCHAIN, 'package.json'));

  assert.equal(app.devDependencies.vite, toolchain.dependencies.vite, 'the two reviewed Vite pins must not drift');
  // esbuild stays a toolchain-only concern: the app calls no bundler API.
  assert.equal(Object.hasOwn(app.dependencies, 'esbuild'), false);
  assert.equal(Object.hasOwn(app.devDependencies, 'esbuild'), false);
  assert.equal(toolchain.dependencies.esbuild, '0.28.2');
});

test('3. the catalog is a valid workspace member, and the root contract is untouched', () => {
  const rootPkg = readJson(path.join(root, 'package.json'));

  assert.deepEqual(rootPkg.workspaces, ['apps/*', 'packages/*']);
  // C3-R34 added no root dependency and no root script.
  assert.equal(rootPkg.dependencies ?? null, null);
  assert.equal(rootPkg.devDependencies ?? null, null);
  assert.deepEqual(Object.keys(rootPkg.scripts).sort(), [
    'test', 'test:approval:live', 'test:runtime', 'validate:foundation'
  ]);

  const lock = readJson(path.join(root, 'package-lock.json'));
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages[APP_REL]?.dependencies, { three: '0.180.0' });
  assert.deepEqual(lock.packages[APP_REL]?.devDependencies, { vite: '7.3.7' });
  assert.deepEqual(lock.packages['node_modules/@autolearnpro/catalog'], { resolved: 'apps/catalog', link: true });

  // The privileged app's dependency resolution is unchanged by this milestone.
  assert.deepEqual(lock.packages['apps/web'].dependencies, { pg: '8.16.3' });
  assert.equal(lock.packages['node_modules/pg'].version, '8.16.3');
});

test('4. the build definition uses no plugins and confines output to apps/catalog/dist', () => {
  const config = codeOnly(fs.readFileSync(path.join(APP, 'vite.config.js'), 'utf8'));

  assert.equal(/\bplugins\s*:/.test(config), false, 'no plugin array may exist');
  for (const banned of ['plugin-react', 'babel', 'swc', 'typescript', 'rollup-plugin', '@vitejs']) {
    assert.equal(config.includes(banned), false, `vite.config.js must not reference ${banned}`);
  }

  // `outDir` is derived from the config file's own location: a build invoked from anywhere still lands
  // inside the app, so it cannot emit into the repository root.
  assert.ok(config.includes("new URL('dist/', import.meta.url)"), 'outDir must be derived from import.meta.url');
  assert.equal(config.includes('process.cwd'), false, 'outDir must not depend on the working directory');
  assert.ok(config.includes('emptyOutDir: true'));
  assert.ok(config.includes("target: 'es2020'"));
});

test('5. browser code imports only its own modules (or Three.js)', () => {
  const files = srcFiles();
  assert.ok(files.length >= 1, 'the app must have at least one source module');

  const specifiers = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  for (const file of files) {
    const text = codeOnly(fs.readFileSync(file, 'utf8'));
    let match;
    while ((match = specifiers.exec(text)) !== null) {
      const spec = match[1] ?? match[2] ?? match[3];
      const allowed = spec.startsWith('./') || spec.startsWith('../') || spec === 'three' || spec.startsWith('three/');
      assert.ok(allowed, `${rel(file)} imports "${spec}" — only relative modules and Three.js are permitted`);
    }
  }
});

test('6. no Node, Worker, privileged-service or network surface in browser code', () => {
  const forbidden = [
    [/(?:from|import)\s*['"]node:/, 'a Node built-in'],
    [/\brequire\s*\(/, 'require()'],
    [/(?:from|import)\s*['"]pg['"]/, 'the pg client'],
    [/apps\/web/, 'apps/web'],
    [/infrastructure\/c3/, 'the C3 privileged library'],
    [/\bwrangler\b/, 'Cloudflare configuration'],
    [/\bfetch\s*\(/, 'fetch()'],
    [/XMLHttpRequest/, 'XMLHttpRequest'],
    [/WebSocket/, 'WebSocket'],
    [/EventSource/, 'EventSource'],
    [/navigator\.sendBeacon/, 'sendBeacon'],
    [/\bimportScripts\b/, 'importScripts']
  ];

  for (const file of srcFiles()) {
    const text = codeOnly(fs.readFileSync(file, 'utf8'));
    for (const [pattern, label] of forbidden) {
      assert.equal(pattern.test(text), false, `${rel(file)} contains ${label}`);
    }
  }

  // The document itself must not reach a privileged surface either.
  const html = codeOnly(fs.readFileSync(path.join(APP, 'index.html'), 'utf8'));
  for (const [pattern, label] of forbidden) {
    assert.equal(pattern.test(html), false, `index.html contains ${label}`);
  }
});

test('7. no external runtime asset references', () => {
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

  for (const match of html.matchAll(/\b(?:src|href|srcset|action|poster)\s*=\s*"([^"]*)"/g)) {
    const value = match[1].trim();
    assert.equal(/^(?:[a-z]+:)?\/\//i.test(value), false, `index.html references the external origin ${value}`);
    assert.equal(/^data:/i.test(value), false, `index.html embeds a data: URI (${value.slice(0, 24)}…)`);
  }

  // Exactly one subresource: the local entry module. No stylesheet, font, preload or model.
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['./src/main.js']);
  assert.equal(/<link\b/i.test(html), false, 'no <link> element may exist (styles are inline)');
  assert.equal(/@import\s/i.test(html), false, 'no CSS @import');
  assert.equal(/url\(\s*['"]?(?:https?:)?\/\//i.test(html), false, 'no remote url() in CSS');

  for (const file of srcFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(text), false, `${rel(file)} contains a remote URL`);
  }
});

test('8. no unchecked dynamic HTML insertion', () => {
  const patterns = [
    [/innerHTML/, 'innerHTML'],
    [/outerHTML/, 'outerHTML'],
    [/insertAdjacentHTML/, 'insertAdjacentHTML'],
    [/document\.write/, 'document.write'],
    [/\beval\s*\(/, 'eval()'],
    [/new\s+Function\s*\(/, 'new Function()'],
    [/setAttribute\s*\(\s*['"]on/i, 'an inline event-handler attribute'],
    [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML']
  ];

  for (const file of srcFiles()) {
    const text = codeOnly(fs.readFileSync(file, 'utf8'));
    for (const [pattern, label] of patterns) {
      assert.equal(pattern.test(text), false, `${rel(file)} uses ${label}`);
    }
  }

  // Text reaches the page through textContent, which does not parse markup.
  const entry = codeOnly(fs.readFileSync(path.join(APP, 'src', 'main.js'), 'utf8'));
  assert.ok(/textContent\s*=/.test(entry), 'the entry module must write text with textContent');
});

test('9. DOM access is isolated to the entry module (C3-R33 D7)', () => {
  const domPattern = /\b(?:document|window|globalThis|localStorage|sessionStorage|navigator)\b|requestAnimationFrame/;
  const touching = srcFiles()
    .filter((file) => domPattern.test(codeOnly(fs.readFileSync(file, 'utf8'))))
    .map(rel);

  assert.deepEqual(touching, ['apps/catalog/src/main.js'], 'only the entry module may touch the platform globals');
});

test('10. no production dataset and no automotive application content', () => {
  // Tokens that would indicate real catalog records, a real asset library, or the held KCOE8006 study.
  const banned = [/KCOE8006/i, /fitment/i, /aut-\d+/i, /caliper/i, /rotor/i, /asset-library/i, /catalog-records/i, /specs\//i];

  const files = appFiles(/\.(?:js|html|json|css|svg|glb|gltf)$/i);
  assert.ok(files.length >= 4, 'the skeleton files must be present');

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, `${rel(file)} matches ${pattern}`);
    }
  }

  // package.json must be the only JSON in the app: any other .json would be undeclared catalog data.
  assert.deepEqual(appFiles(/\.json$/i).map(rel), ['apps/catalog/package.json']);
  // And there must be no binary/model payload at all in a skeleton.
  assert.deepEqual(appFiles(/\.(?:glb|gltf|stl|step)$/i).map(rel), []);
});

test('11. the app builds locally, with confined and byte-reproducible output', (t) => {
  if (!fs.existsSync(VITE_BIN)) {
    t.skip('vite is not installed at the root; run npm ci before this test');
    return;
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  viteBuild();
  const first = digestTree(DIST);
  viteBuild();
  const second = digestTree(DIST);

  assert.ok(first.length >= 2, 'the build must emit the document and at least one script');
  assert.ok(first.some(([name]) => name === 'index.html'));
  assert.deepEqual(second, first, 'two consecutive builds must produce byte-identical output');

  // Nothing is emitted into the repository root, and the app emits only into its own dist.
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
  assert.equal(fs.existsSync(path.join(root, 'assets')), false);

  // The skeleton defers Three.js: the bundle is the shell only, so no vendor chunk exists yet.
  const js = first.filter(([name]) => name.endsWith('.js'));
  const jsBytes = js.reduce((total, [, , size]) => total + size, 0);
  assert.ok(jsBytes < 16384, `the skeleton shell bundle should stay small, saw ${jsBytes} bytes`);

  // The built document references only relative, local assets.
  const built = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert.equal(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(built), false, 'the built document must not reach an external origin');
  for (const match of built.matchAll(/\bsrc\s*=\s*"([^"]+)"/g)) {
    assert.equal(/^(?:[a-z]+:)?\/\//i.test(match[1]), false);
    assert.ok(fs.existsSync(path.join(DIST, match[1].replace(/^\.?\//, ''))), `built asset ${match[1]} must exist`);
  }

  // Build output must never become committable.
  try {
    execFileSync('git', ['-C', root, 'check-ignore', '-q', 'apps/catalog/dist/index.html'], { stdio: 'ignore' });
  } catch (error) {
    assert.notEqual(error.status, 1, 'apps/catalog/dist must be ignored by .gitignore');
  }
});

test('12. the foundation validator still passes, unweakened, with the catalog present', () => {
  const output = execFileSync(process.execPath, [path.join(root, 'infrastructure', 'scripts', 'validate-foundation.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000
  });
  assert.match(output, /Foundation 1 validated: 13 directories/);
});

