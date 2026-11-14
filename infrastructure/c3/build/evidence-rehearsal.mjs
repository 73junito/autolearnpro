// C3-R36D: integrated offline evidence rehearsal.
//
// WHAT THIS DOES: runs the four reviewed contracts together, in order, against the real Worker source and the real
// repository inputs, and returns a structured verdict about whether they compose.
//
//   R35 assertBuildInputMapping  -> explicit three-root mapping, temporary-only output policy
//   R36A createSourceSnapshot    -> canonical multi-root snapshot with a combined digest
//   R36B bundleWorker            -> isolated esbuild 0.28.2 bundle of the unchanged Worker
//   R36C createEvidenceEnvelope  -> versioned envelope binding snapshot, source, artifact and toolchain
//        writeEvidenceEnvelope   -> exclusive, fsynced, read-back-verified persistence
//        verifyEvidenceFile      -> independent reload, re-derivation and comparison
//
// This module orchestrates; it never re-implements a rule. Every refusal below comes from the contract that owns
// it, so a change in one contract is a change in the rehearsal's behaviour — which is the point of composing them.
//
// WHAT A PASSING REHEARSAL ESTABLISHES (and nothing more):
//   reviewedInputsMatchedSnapshot · bundleBytesMatchedRecordedDigest ·
//   persistedEnvelopeReloadedAndVerified · localProcessCompletedWithoutObservedPolicyViolation
//
// WHAT IT CANNOT ESTABLISH: Git commit authenticity, CI identity, signed provenance, human release approval,
// publication authorization, deployment authorization. The four trusted flags stay false.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertPolicy } from '../library/target-policy.mjs';
import { assertBuildInputMapping } from './build-input-contract.mjs';
import { createSourceSnapshot } from './source-snapshot.mjs';
import { BUNDLE_FILE_NAME, bundleWorker, inspectBundle, removeBundleOutput } from './worker-bundle.mjs';
import {
  EVIDENCE_FILE_NAME,
  createEvidenceEnvelope,
  removeEvidenceFile,
  verifyEvidenceFile,
  writeEvidenceEnvelope
} from './evidence-envelope.mjs';

export const REHEARSAL_SCHEMA = 'alp-c3-r36d-evidence-rehearsal';
export const REHEARSAL_VERSION = 1;

// The directories a rehearsal needs, each with a single owner. Reusing one for two purposes is refused, because
// that is how a "clean" output root gets quietly reused as a snapshot scratch.
export const REHEARSAL_DIRECTORIES = Object.freeze(['build', 'snapshot', 'evidence']);

export const REHEARSAL_STAGES = Object.freeze([
  'mapping',
  'snapshot',
  'bundle',
  'inspection',
  'envelope',
  'persistence',
  'reload',
  'verification'
]);

export const REHEARSAL_ESTABLISHES = Object.freeze([
  'reviewedInputsMatchedSnapshot',
  'bundleBytesMatchedRecordedDigest',
  'persistedEnvelopeReloadedAndVerified',
  'localProcessCompletedWithoutObservedPolicyViolation'
]);

export const REHEARSAL_DOES_NOT_ESTABLISH = Object.freeze([
  'gitCommitAuthenticity',
  'ciIdentity',
  'signedProvenance',
  'humanReleaseApproval',
  'publicationAuthorization',
  'deploymentAuthorization'
]);

const REHEARSAL_CLAIMS = Object.freeze({
  sourceCommitVerified: false,
  ciAttested: false,
  publicationAuthorized: false,
  deployAllowed: false
});

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const inside = (parent, child) => child.toLowerCase().startsWith((parent + path.sep).toLowerCase());
const equal = (a, b) => a.toLowerCase() === b.toLowerCase();

// Validates the three owned directories: explicit, existing, real (not links), distinct, non-nested, empty,
// inside the policy root, and outside every source root.
function resolveDirectories(policy, directories, roots) {
  const authorised = assertPolicy(policy);
  if (!directories || typeof directories !== 'object') throw Error('R36D_DIRECTORIES_REQUIRED');

  const resolved = {};
  for (const name of REHEARSAL_DIRECTORIES) {
    const value = directories[name];
    if (typeof value !== 'string' || value.length === 0) throw Error(`R36D_DIRECTORY_REQUIRED:${name}`);

    let stats;
    try {
      stats = fs.lstatSync(value);
    } catch {
      throw Error(`R36D_DIRECTORY_MISSING:${name}`);
    }
    if (stats.isSymbolicLink()) throw Error(`R36D_DIRECTORY_SYMLINK:${name}`);
    if (!stats.isDirectory()) throw Error(`R36D_DIRECTORY_NOT_DIRECTORY:${name}`);

    // realpath, not the argument, is what containment is judged on: a junction resolves to its target.
    const real = fs.realpathSync(value);
    if (equal(real, authorised.rootDir) || !inside(authorised.rootDir, real)) {
      throw Error(`R36D_DIRECTORY_OUTSIDE_POLICY:${name}`);
    }
    for (const root of [roots?.repository, roots?.catalog, roots?.worker]) {
      if (typeof root === 'string' && (equal(real, root) || inside(root, real))) {
        throw Error(`R36D_DIRECTORY_INSIDE_SOURCE:${name}`);
      }
    }
    if (fs.readdirSync(real).length) throw Error(`R36D_DIRECTORY_NOT_EMPTY:${name}`);
    resolved[name] = real;
  }

  for (const outer of REHEARSAL_DIRECTORIES) {
    for (const inner of REHEARSAL_DIRECTORIES) {
      if (outer === inner) continue;
      if (equal(resolved[outer], resolved[inner])) throw Error(`R36D_DIRECTORY_REUSED:${outer}=${inner}`);
      if (inside(resolved[outer], resolved[inner])) throw Error(`R36D_DIRECTORY_NESTED:${inner}-in-${outer}`);
    }
  }
  return resolved;
}

/**
 * Runs the rehearsal. Every stage delegates to the contract that owns the rule; failures propagate unchanged, so
 * a caller sees `R35_*`, `R36A_*`, `R36B_*` or `R36C_*` rather than a wrapper code that hides them.
 */
export async function runEvidenceRehearsal({ policy, roots, directories, toolchain, fileName = EVIDENCE_FILE_NAME } = {}) {
  if (!toolchain || typeof toolchain !== 'object') throw Error('R36D_TOOLCHAIN_REQUIRED');
  const owned = resolveDirectories(policy, directories, roots);
  const stages = [];
  const record = (stage) => stages.push(stage);

  // 1 — explicit R35 mapping, which also enforces the temporary-only output policy.
  const mapping = assertBuildInputMapping({ policy, outputRoot: owned.snapshot, roots });
  record('mapping');

  // 2 — R36A snapshot of the same inputs.
  const snapshot = createSourceSnapshot({ policy, outputRoot: owned.snapshot, roots });
  record('snapshot');

  // 3 — R36B bundle of the real Worker into its own directory.
  const bundle = await bundleWorker({ policy, outputRoot: owned.build, roots, write: true });
  record('bundle');

  // 4 — inspect the bytes that were actually persisted, not the in-memory copy the bundler reported.
  const emitted = fs.readFileSync(bundle.written.path);
  const inspection = inspectBundle(emitted);
  if (!inspection.ok) throw Error(`R36D_BUNDLE_INSPECTION_FAILED:${inspection.findings.join(',')}`);
  if (inspection.sha256 !== bundle.output.sha256) throw Error('R36D_BUNDLE_BYTES_CHANGED');
  record('inspection');

  // 5 — R36C envelope binding the three records.
  const envelope = createEvidenceEnvelope({ snapshot, bundle, toolchain });
  record('envelope');

  // 6 — persistence, exclusive and read-back verified.
  const written = writeEvidenceEnvelope({ policy, evidenceRoot: owned.evidence, envelope, roots, fileName });
  record('persistence');

  // 7/8 — reload and independently re-verify against the snapshot and toolchain derived here.
  const verification = verifyEvidenceFile({
    policy,
    evidenceRoot: owned.evidence,
    artifactRoot: owned.build,
    fileName,
    snapshot,
    toolchain
  });
  record('reload');
  record('verification');

  // The verdict deliberately contains no absolute path and no clock: two independent environments with the same
  // inputs must produce an identical verdict, or the difference is a finding.
  return Object.freeze({
    schema: REHEARSAL_SCHEMA,
    version: REHEARSAL_VERSION,
    ok: verification.ok === true && stages.length === REHEARSAL_STAGES.length,
    stages: Object.freeze(stages),
    mapping: Object.freeze({
      inputs: mapping.inputs.length,
      roles: Object.freeze([...new Set(mapping.inputs.map((input) => input.role))].sort())
    }),
    snapshot: Object.freeze({
      schema: snapshot.schema,
      combinedSha256: snapshot.combinedSha256,
      declared: snapshot.declared.length,
      entries: snapshot.entries.length,
      exclusions: snapshot.exclusions.length
    }),
    bundle: Object.freeze({
      file: BUNDLE_FILE_NAME,
      bytes: bundle.output.bytes,
      sha256: bundle.output.sha256,
      findings: inspection.findings.length
    }),
    envelope: Object.freeze({
      schema: envelope.envelopeSchema,
      version: envelope.envelopeVersion,
      sha256: envelope.envelopeSha256,
      file: fileName,
      fileBytes: written.bytes,
      fileSha256: written.sha256,
      durability: written.durable
    }),
    verification: Object.freeze({
      ok: verification.ok,
      establishes: verification.establishes,
      doesNotEstablish: verification.doesNotEstablish,
      claims: verification.claims
    }),
    establishes: REHEARSAL_ESTABLISHES,
    doesNotEstablish: REHEARSAL_DOES_NOT_ESTABLISH,
    claims: REHEARSAL_CLAIMS
  });
}

// Removes only what this rehearsal wrote, and only from the directories it was given. Both underlying removers
// refuse unexpected occupants, so a shared directory cannot be "cleaned" by accident.
export function cleanRehearsal({ policy, directories, fileName = EVIDENCE_FILE_NAME } = {}) {
  if (!directories || typeof directories !== 'object') throw Error('R36D_DIRECTORIES_REQUIRED');
  const removed = [];
  // Evidence first, then the bundle: each remover validates containment and ownership independently.
  removed.push({ evidence: removeEvidenceFile({ policy, evidenceRoot: directories.evidence, fileName }) });
  removed.push({ bundle: removeBundleOutput({ policy, outputRoot: directories.build }) });
  return Object.freeze({
    removed: Object.freeze(removed.map((entry) => Object.freeze(entry))),
    snapshotDirectoryUntouched: true
  });
}

