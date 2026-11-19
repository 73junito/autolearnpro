#!/usr/bin/env node
// C3-R36E producer — runs the integrated rehearsal in its OWN process and then exits.
//
// Invocation:  node evidence-producer.cli.mjs '<json payload>'
// Emits exactly one JSON line on stdout and sets an exit code. It never prints a stack trace, because a stack
// trace on stdout would be indistinguishable from a verdict to a caller parsing JSON.
//
// It is deliberately thin: all validation lives in the reviewed contracts. This file only decodes the payload,
// re-derives the policy from its values, and calls the rehearsal.
import { createTargetPolicy } from '../library/target-policy.mjs';
import { runEvidenceRehearsal } from './evidence-rehearsal.mjs';

const PRODUCER = 'evidence-producer.cli';

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

  // The policy is re-derived from its values, so a hand-written object buys nothing.
  const policy = createTargetPolicy({
    tier: payload.policy.tier,
    rootDir: payload.policy.rootDir,
    targets: payload.policy.targets
  });

  const verdict = await runEvidenceRehearsal({
    policy,
    roots: payload.roots,
    directories: payload.directories,
    toolchain: payload.toolchain,
    fileName: payload.fileName
  });

  emit({
    ok: verdict.ok === true,
    producer: PRODUCER,
    pid: process.pid,
    stages: verdict.stages,
    snapshot: verdict.snapshot,
    bundle: verdict.bundle,
    envelope: verdict.envelope,
    claims: verdict.claims
  }, verdict.ok === true ? 0 : 1);
} catch (error) {
  emit({ ok: false, producer: PRODUCER, pid: process.pid, error: String(error?.message ?? error) }, 1);
}
