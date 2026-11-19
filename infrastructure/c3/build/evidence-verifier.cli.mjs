#!/usr/bin/env node
// C3-R36E verifier — verifies persisted evidence in a SEPARATE process that never saw the producer's objects.
//
// Invocation:  node evidence-verifier.cli.mjs '<json payload>'
//
// WHAT THIS PROCESS RECEIVES FROM THE CALLER: paths only — the policy values, the three directories, the three
// roots, and the toolchain's *labels*. It receives no digest, no snapshot object, no bundle record and no claim.
//
// WHAT IT DERIVES ITSELF:
//   - the policy, re-validated from its values (temporary tier only);
//   - the source snapshot, recomputed from the working tree through C3-R36A;
//   - the toolchain version, read from the isolated esbuild install beside this file.
//
// A producer-written metadata file is never consulted: the only producer output it reads is the evidence envelope,
// and that envelope is checked against the two derivations above rather than believed.
import fs from 'node:fs';
import { createTargetPolicy } from '../library/target-policy.mjs';
import { createSourceSnapshot } from './source-snapshot.mjs';
import { verifyEvidenceFile } from './evidence-envelope.mjs';

const VERIFIER = 'evidence-verifier.cli';

function emit(payload, code) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = code;
}

function decode(raw) {
  if (typeof raw !== 'string' || raw.length === 0) throw Error('R36E_PAYLOAD_REQUIRED');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Error('R36E_PAYLOAD_INVALID');
  }
  if (!parsed || typeof parsed !== 'object') throw Error('R36E_PAYLOAD_INVALID');
  return parsed;
}

try {
  const payload = decode(process.argv[2]);
  if (!payload.policy || typeof payload.policy !== 'object') throw Error('R36E_POLICY_REQUIRED');
  if (!payload.roots || typeof payload.roots !== 'object') throw Error('R36E_ROOTS_REQUIRED');
  if (!payload.directories || typeof payload.directories !== 'object') throw Error('R36E_DIRECTORIES_REQUIRED');
  if (!payload.toolchain || typeof payload.toolchain !== 'object') throw Error('R36E_TOOLCHAIN_REQUIRED');

  const policy = createTargetPolicy({
    tier: payload.policy.tier,
    rootDir: payload.policy.rootDir,
    targets: payload.policy.targets
  });

  // The installed toolchain version is read here, in this process. If the caller also states a version, the two
  // must agree, so a caller cannot substitute a version the machine does not have.
  const installed = JSON.parse(fs.readFileSync(new URL('./node_modules/esbuild/package.json', import.meta.url), 'utf8'));
  if (payload.toolchain.version !== undefined && payload.toolchain.version !== installed.version) {
    throw Error(`R36E_TOOLCHAIN_VERSION_MISMATCH:${String(payload.toolchain.version)}!=${installed.version}`);
  }

  const snapshot = createSourceSnapshot({
    policy,
    outputRoot: payload.directories.snapshot,
    roots: payload.roots
  });

  const verification = verifyEvidenceFile({
    policy,
    evidenceRoot: payload.directories.evidence,
    artifactRoot: payload.directories.build,
    fileName: payload.fileName,
    snapshot,
    toolchain: { name: payload.toolchain.name, version: installed.version, configId: payload.toolchain.configId }
  });

  emit({
    ok: verification.ok === true,
    verifier: VERIFIER,
    pid: process.pid,
    source: verification.source,
    artifact: verification.artifact,
    snapshot: verification.snapshot,
    toolchain: verification.toolchain,
    establishes: verification.establishes,
    doesNotEstablish: verification.doesNotEstablish,
    claims: verification.claims
  }, verification.ok === true ? 0 : 1);
} catch (error) {
  emit({ ok: false, verifier: VERIFIER, pid: process.pid, error: String(error?.message ?? error) }, 1);
}
