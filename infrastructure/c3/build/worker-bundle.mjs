// C3-R36B: isolated Worker bundle feasibility (B11).
//
// THE QUESTION THIS ANSWERS: can `infrastructure/cloudflare/worker.mjs`, unchanged, be bundled by the
// independently pinned esbuild in `infrastructure/c3/build` into a self-contained ESM module, reproducibly, with
// the output confined to an authorised temporary directory?
//
// WHAT IT IS NOT: release evidence. No generation id, no pair id, no attestation, no signature, no approval and
// no publication authority is produced or implied. The four trusted claim flags stay false.
//
// DEPENDENCY RESOLUTION: `esbuild` is imported as a bare specifier from this file, so Node resolves it to
// `infrastructure/c3/build/node_modules/esbuild` — the isolated 0.28.2 pin. It is deliberately NOT resolved from
// the root install, which carries Vite's transitive esbuild for the catalog.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { assertPolicy } from '../library/target-policy.mjs';
import { assertBuildInputMapping, assertWorkerBoundary, INPUT_KINDS, INPUT_ROLES } from './build-input-contract.mjs';

export const BUNDLE_CONFIG_ID = 'alp-c3-r36b-worker-bundle-v1';
export const BUNDLE_FILE_NAME = 'worker.mjs';

// The minimum configuration that is Cloudflare-Worker-compatible, with the reason each setting exists:
//
//   bundle:true      - the artifact must be self-contained; a Worker cannot resolve bare specifiers at runtime.
//   format:'esm'     - the Workers module format; also what `export default { fetch }` requires.
//   platform:'browser'
//                    - no Node builtin shims are supplied. This is the fail-closed choice: if the Worker ever
//                      imports `node:fs`, esbuild errors here instead of the bundler quietly polyfilling it.
//   target:'es2022'  - the V8 version range Workers provide; pinned so a future default cannot silently move it.
//   write:false      - bytes are produced in memory first, so policy and containment are checked before anything
//                      reaches a filesystem. A failed build therefore cannot leave a partial artifact.
//   metafile:true    - records the resolved input set for inspection; never treated as evidence.
//   legalComments:'none', charset:'utf8', sourcemap:false
//                    - removes incidental variation from the output, which is what makes two builds comparable.
//   mainFields / conditions
//                    - explicit browser-first resolution, matching the Worker runtime's capabilities.
//   external: []     - nothing may be left external: an external specifier would be unresolvable at runtime.
export const BUNDLE_CONFIG = Object.freeze({
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  metafile: true,
  legalComments: 'none',
  sourcemap: false,
  charset: 'utf8',
  logLevel: 'silent',
  mainFields: Object.freeze(['browser', 'module', 'main']),
  conditions: Object.freeze(['browser', 'import', 'default']),
  external: Object.freeze([])
});

// The build DID run, so that claim is true. Everything about authority, persistence and release is false.
export const FEASIBILITY_CLAIMS = Object.freeze({
  buildExecuted: true,
  artifactPersisted: false,
  artifactPublished: false,
  deployed: false,
  releaseEvidenceProduced: false,
  sourceCommitVerified: false,
  ciAttested: false,
  publicationAuthorized: false,
  deployAllowed: false
});

const TRUSTED_FLAGS = Object.freeze(['sourceCommitVerified', 'ciAttested', 'publicationAuthorized', 'deployAllowed']);

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const inside = (parent, child) => child.toLowerCase().startsWith((parent + path.sep).toLowerCase());

// Inspects the emitted bytes. Static by design: the bundle is never executed here, so inspection cannot be
// confused with "the Worker works".
export function inspectBundle(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  const findings = [];

  const forbidden = [
    ['require(', 'a CommonJS require call'],
    ['module.exports', 'a CommonJS export'],
    ['__dirname', '__dirname'],
    ['__filename', '__filename'],
    ['process.env', 'process.env access'],
    ['from "node:', 'a Node builtin import'],
    ["from 'node:", 'a Node builtin import'],
    ['import("node:', 'a dynamic Node builtin import'],
    ["import('node:", 'a dynamic Node builtin import'],
    ['apps/web', 'a privileged application import'],
    ['infrastructure/c3', 'the C3 privileged library'],
    ['wrangler deploy', 'a deployment command']
  ];
  for (const [token, label] of forbidden) {
    if (text.includes(token)) findings.push(label);
  }

  // After bundling there must be no resolvable-external specifier left behind.
  for (const match of text.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) findings.push(`external specifier ${specifier}`);
  }

  const isEsm = /(?:^|\n)\s*export\s+(?:default|\{|const|function|class)/.test(text);
  if (!isEsm) findings.push('no top-level ESM export found');

  return Object.freeze({
    ok: findings.length === 0,
    esm: isEsm,
    bytes: Buffer.byteLength(text),
    sha256: sha256(Buffer.from(text, 'utf8')),
    findings: Object.freeze(findings)
  });
}

// Runs the experiment. Policy, roots and inputs are exactly the C3-R35 arguments, so the temporary-tier gate and
// every containment rule apply unchanged; nothing here can authorise a staging or production destination.
export async function bundleWorker({ policy, outputRoot, roots, inputs, snapshot, write = true } = {}) {
  const mapping = inputs
    ? assertBuildInputMapping({ policy, outputRoot, roots, inputs })
    : assertBuildInputMapping({ policy, outputRoot, roots });

  // The Worker boundary is re-checked here rather than assumed from the mapping: the bundle must not be produced
  // from a source that has acquired an import or lost its wrangler `main` agreement.
  const boundary = assertWorkerBoundary({ root: mapping.roots.worker });

  // The entry point comes from the validated mapping. It is never inferred from this module's location.
  const mappedEntry = mapping.inputs.find((input) => input.role === INPUT_ROLES.WORKER
    && input.kind === INPUT_KINDS.FILE
    && input.path === boundary.entry.path);
  if (!mappedEntry) throw Error(`R36B_WORKER_ENTRY_NOT_MAPPED:${boundary.entry.path}`);
  if (mappedEntry.sha256 !== boundary.entry.sha256) throw Error('R36B_WORKER_ENTRY_CHANGED');

  let result;
  try {
    result = await build({
      ...BUNDLE_CONFIG,
      entryPoints: [mappedEntry.absolute],
      absWorkingDir: mapping.roots.worker,
      outfile: BUNDLE_FILE_NAME
    });
  } catch (error) {
    // Reported as-is. The Worker is not edited to make the experiment pass.
    throw Error(`R36B_BUNDLE_FAILED:${String(error?.message ?? error).split('\n')[0]}`);
  }

  if (!Array.isArray(result.outputFiles) || result.outputFiles.length !== 1) {
    throw Error(`R36B_UNEXPECTED_OUTPUT_COUNT:${result.outputFiles?.length ?? 0}`);
  }
  const outputFile = result.outputFiles[0];
  const bytes = Buffer.from(outputFile.contents);
  if (bytes.length === 0) throw Error('R36B_EMPTY_OUTPUT');
  if (path.basename(outputFile.path) !== BUNDLE_FILE_NAME) {
    throw Error(`R36B_UNEXPECTED_OUTPUT_NAME:${path.basename(outputFile.path)}`);
  }

  const inspection = inspectBundle(bytes);
  const record = {
    ok: inspection.ok,
    configId: BUNDLE_CONFIG_ID,
    config: BUNDLE_CONFIG,
    entry: Object.freeze({ path: mappedEntry.path, absolute: mappedEntry.absolute, bytes: mappedEntry.size, sha256: mappedEntry.sha256 }),
    output: Object.freeze({ file: BUNDLE_FILE_NAME, bytes: bytes.length, sha256: inspection.sha256 }),
    inspection,
    claims: FEASIBILITY_CLAIMS,
    notEstablished: Object.freeze([
      'gitOrigin', 'authorship', 'review', 'ciExecution', 'signedProvenance', 'releaseApproval',
      'publicationAuthority', 'deploymentAuthorization', 'runtimeBehaviour'
    ])
  };

  if (snapshot) {
    // Association only. The C3-R36A record format is not modified; the link is recorded on this side.
    if (typeof snapshot.combinedSha256 !== 'string') throw Error('R36B_SNAPSHOT_INVALID');
    record.snapshot = Object.freeze({ schema: snapshot.schema, combinedSha256: snapshot.combinedSha256 });
  }

  if (write) {
    // Written only after the output is known, so a failed build cannot leave a partial artifact in place.
    const out = fs.realpathSync(mapping.outputRoot);
    const destination = path.join(out, BUNDLE_FILE_NAME);
    if (!inside(out, destination)) throw Error('R36B_OUTPUT_ESCAPE');
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
    record.written = Object.freeze({ path: destination, bytes: bytes.length, sha256: inspection.sha256 });
  }

  return Object.freeze(record);
}

// Removes only the artifact this harness owns, only from an authorised temporary directory, and refuses to touch
// anything that looks like it does not belong there.
export function removeBundleOutput({ policy, outputRoot } = {}) {
  const authorised = assertPolicy(policy);
  if (typeof outputRoot !== 'string' || outputRoot.length === 0) throw Error('R36B_OUTPUT_REQUIRED');
  let out;
  try {
    out = fs.realpathSync(outputRoot);
  } catch {
    throw Error('R36B_OUTPUT_UNAVAILABLE');
  }
  if (!inside(authorised.rootDir, out)) throw Error('R36B_OUTPUT_OUTSIDE_POLICY');

  const entries = fs.readdirSync(out);
  const unexpected = entries.filter((name) => name !== BUNDLE_FILE_NAME);
  if (unexpected.length) throw Error(`R36B_CLEANUP_UNEXPECTED:${unexpected.join(',')}`);
  for (const name of entries) fs.rmSync(path.join(out, name));
  return Object.freeze({ removed: entries.length, directory: out });
}

// Re-derives the trusted flags from a record, so a supplied record cannot be read as an attestation.
export function assertFeasibilityRecord(record) {
  if (!record || typeof record !== 'object') throw Error('R36B_RECORD_REQUIRED');
  if (record.configId !== BUNDLE_CONFIG_ID) throw Error(`R36B_RECORD_CONFIG_UNKNOWN:${String(record.configId)}`);
  for (const flag of TRUSTED_FLAGS) {
    if (record.claims?.[flag] !== false) throw Error(`R36B_FORGED_CLAIM:${flag}`);
  }
  if (record.inspection?.ok !== true) throw Error('R36B_RECORD_INSPECTION_FAILED');
  if (typeof record.output?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.output.sha256)) throw Error('R36B_RECORD_DIGEST_INVALID');
  return Object.freeze({
    ok: true,
    configId: record.configId,
    output: record.output,
    claims: FEASIBILITY_CLAIMS,
    establishes: Object.freeze(['bundleProducibleFromPinnedToolchain']),
    doesNotEstablish: record.notEstablished
  });
}


