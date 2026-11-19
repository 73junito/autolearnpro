// C3-R37.1 — generate the exact pre-integration inventory. Read-only: it inspects git state and writes one JSON file.
// Usage: node docs/c3-r37a/tools/build-integration-inventory.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const OUT = path.join(REPO, 'docs', 'c3-r37a', 'C3-R37A-FILE-INVENTORY.json');
const OUT_REL = 'docs/c3-r37a/C3-R37A-FILE-INVENTORY.json';

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (args) => {
  const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return String(result.stdout);
};

// --- collect the candidate set straight from Git, not from a hand-written list ----------------------------
// This milestone's own documents are excluded from `rows` and listed separately: a manifest cannot contain its own
// digest, and including some of them while excluding others would make the row count depend on write order.
const MILESTONE_PREFIX = 'docs/c3-r37a/';
const status = git(['status', '--porcelain', '--untracked-files=all']);
const rows = [];
const milestonePaths = [];
for (const line of status.split('\n')) {
  if (!line.trim()) continue;
  const code = line.slice(0, 2);
  const file = line.slice(3).trim();
  if (file.startsWith(MILESTONE_PREFIX)) {
    milestonePaths.push(file);
    continue;
  }
  rows.push({ path: file, gitStatus: code.trim() || '??' });
}

// --- byte facts for every candidate ----------------------------------------------------------------------
for (const row of rows) {
  const absolute = path.join(REPO, row.path);
  if (!fs.existsSync(absolute)) throw new Error(`R37A_MISSING_FILE:${row.path}`);
  const buffer = fs.readFileSync(absolute);
  row.bytes = buffer.length;
  row.sha256 = sha(buffer);
  row.crlfPairs = (buffer.toString('utf8').match(/\r\n/g) ?? []).length;
  row.extension = path.extname(row.path) || '(none)';
}

// --- duplicate detection by content: a screenshot repeating another's bytes is not independent evidence ---
const pngs = rows.filter((row) => row.path.toLowerCase().endsWith('.png'));
const byHash = new Map();
for (const row of pngs) {
  if (!byHash.has(row.sha256)) byHash.set(row.sha256, []);
  byHash.get(row.sha256).push(row);
}
const canonicalPng = new Map();
for (const [hash, group] of byHash) {
  // Earliest milestone first, then alphabetical, so the choice is reproducible rather than arbitrary.
  const sorted = group.slice().sort((a, b) => a.path.localeCompare(b.path));
  canonicalPng.set(hash, sorted[0].path);
}

// --- classification rules, in one place, so every row's action is justifiable ------------------------------
function classify(row) {
  const p = row.path;
  const lower = p.toLowerCase();

  if (lower.endsWith('.png')) {
    const keep = canonicalPng.get(row.sha256);
    if (keep === p) {
      return { action: 'add', kind: 'evidence', justification: `canonical copy of screenshot bytes ${row.sha256.slice(0, 12)}…; every other copy of these exact bytes is a duplicate` };
    }
    return { action: 'exclude', kind: 'generated-evidence', justification: `byte-identical duplicate of ${keep}; keeping both would double-count one piece of evidence` };
  }
  if (lower.includes('/runs/') && lower.endsWith('gate-results.json')) {
    return { action: 'exclude', kind: 'generated-evidence', justification: 'per-run output embedding an ephemeral port and an absolute path (B21); the milestone record is the durable evidence' };
  }
  if (lower.includes('/logs/')) {
    return { action: 'add', kind: 'evidence', justification: 'captured console output that is the sole surviving support for an accepted claim (B27 replaced the summary it belongs to)' };
  }
  if (p === '.gitignore') {
    return { action: 'modify', kind: 'configuration', justification: 'required: the tracked build/ rule otherwise hides infrastructure/c3/build/ at any depth (verified C3-R37 §5.1)' };
  }
  if (p === 'package-lock.json') {
    return { action: 'modify', kind: 'configuration', justification: 'required: registers the apps/catalog workspace with exact vite 7.3.7 / three 0.180.0' };
  }
  if (lower.endsWith('.md')) {
    const scaffold = p === 'supabase/functions/README.md' || /^(apps|packages)\/[^/]+\/README\.md$/.test(p);
    return scaffold
      ? { action: 'add', kind: 'documentation', justification: 'scaffold README: creates a directory validate:foundation requires' }
      : { action: 'add', kind: 'documentation', justification: 'reviewed decision record' };
  }
  if (lower.startsWith('tests/')) return { action: 'add', kind: 'test', justification: 'test suite or fixture referenced by a reviewed milestone' };
  if (lower.startsWith('infrastructure/c3/') || lower.startsWith('apps/catalog/')) {
    return { action: 'add', kind: 'source', justification: 'C3 or catalog source under review' };
  }
  if (lower.endsWith('.json')) return { action: 'add', kind: 'evidence', justification: 'machine-readable manifest or reviewed result cited by a record' };
  if (lower.endsWith('.mjs')) return { action: 'add', kind: 'source', justification: 'tool or module source' };
  if (lower.endsWith('.yml') || lower.endsWith('.sh')) return { action: 'add', kind: 'tooling', justification: 'tooling asset referenced by a record' };
  if (lower.endsWith('.html') || lower.endsWith('.js')) return { action: 'add', kind: 'source', justification: 'catalog application entry point' };
  return { action: 'defer', kind: 'unclassified', justification: 'no rule matched — this path needs an explicit decision before integration' };
}

for (const row of rows) Object.assign(row, classify(row));

// --- invariants -------------------------------------------------------------------------------------------
const paths = rows.map((row) => row.path);
const duplicatePaths = paths.filter((p, i) => paths.indexOf(p) !== i);
const deferred = rows.filter((row) => row.action === 'defer');
const byAction = rows.reduce((acc, row) => { acc[row.action] = (acc[row.action] ?? 0) + 1; return acc; }, {});
const byActionKind = rows.reduce((acc, row) => { const key = `${row.action}:${row.kind}`; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});

const manifest = {
  schema: 'alp-c3-r37a-file-inventory-v1',
  generatedFrom: {
    head: git(['rev-parse', 'HEAD']).trim(),
    command: 'git status --porcelain --untracked-files=all',
    coreAutocrlf: (spawnSync('git', ['config', '--get', 'core.autocrlf'], { cwd: REPO, encoding: 'utf8' }).stdout ?? '').trim() || '(unset)'
  },
  invariants: { rowCount: rows.length, duplicatePaths, deferredCount: deferred.length, everyFileExists: true },
  counts: { byAction, byActionKind },
  rows,
  // The C3-R37.1 documents are additions too, but they are counted apart from `rows` so the inventory is stable and
  // never contains its own digest. `docs/c3-r37a/` is deliberately excluded from `rows` in one place, above.
  milestoneAdditions: milestonePaths.sort().map((p) => {
    if (p === OUT_REL) {
      // Self-reference would make this file's digest depend on its own previous content, so it is named but not hashed.
      return { path: p, sha256: null, action: 'add', kind: 'documentation', note: 'this manifest: a file cannot contain its own digest; reported in the handoff' };
    }
    const absolute = path.join(REPO, p);
    if (!fs.existsSync(absolute)) return { path: p, sha256: null, note: 'declared but not yet written at generation time' };
    const buffer = fs.readFileSync(absolute);
    return { path: p, bytes: buffer.length, sha256: sha(buffer), action: 'add', kind: p.endsWith('.mjs') ? 'tooling' : 'documentation' };
  }),
  totals: {
    add: byAction.add + milestonePaths.length,
    modify: byAction.modify,
    exclude: byAction.exclude,
    note: 'add includes milestoneAdditions; rows and milestoneAdditions together are the proposed integration set'
  },
  self: { path: OUT_REL, note: 'a manifest cannot contain its own digest; the value is reported in the handoff' }
};


fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ rowCount: rows.length, byAction, duplicatePaths, deferred: deferred.map((r) => r.path), out: OUT_REL }, null, 2));

