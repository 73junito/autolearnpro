// C3-R37H remediation R1 (finding B21) — deterministic findings digest tests.
//
// Acceptance cases required by the remediation directive:
//   - same input, repeated execution -> identical digest
//   - different ordering, same logical findings -> identical digest
//   - changed security finding -> different digest
//   - changed finding severity -> different digest
//   - changed relevant source content -> different digest
//   - malformed findings -> explicit rejection
//   - Linux/Windows path differences -> deterministic result where logically equivalent
//   - volatile execution metadata never enters the digest, and is retained separately for auditing
//
// Run with: node --test tests/c3-canonical-findings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFindingsDigest,
  verifyFindingsDigest,
  normalizePath,
  FINDINGS_SCHEMA,
  FINDINGS_VERSION
} from '../infrastructure/c3/build/canonical-findings.mjs';

const baseFindings = () => [
  { id: 'B21-1', severity: 'high', category: 'security', path: 'infrastructure/c3/build/worker-bundle.mjs', message: 'external specifier found', sourceSha256: 'a'.repeat(64) },
  { id: 'B21-2', severity: 'low', category: 'reliability', path: 'tests/c3-recovery.test.mjs', message: 'lock file remained', sourceSha256: 'b'.repeat(64) },
  { id: 'B21-3', severity: 'critical', category: 'security', path: 'docs/c3-r36h3/tools/browser-gate.mjs', message: 'report overwrite possible', sourceSha256: 'c'.repeat(64) }
];

test('1. same input, repeated execution produces an identical digest', () => {
  const digests = new Set();
  for (let run = 0; run < 10; run += 1) {
    digests.add(buildFindingsDigest({ findings: baseFindings() }).digest);
  }
  assert.equal(digests.size, 1, 'ten identical executions must produce one digest');
  const result = buildFindingsDigest({ findings: baseFindings() });
  assert.equal(result.schema, FINDINGS_SCHEMA);
  assert.equal(result.version, FINDINGS_VERSION);
  assert.match(result.digest, /^[a-f0-9]{64}$/);
  assert.equal(result.counts.total, 3);
});

test('2. different ordering of the same logical findings produces an identical digest', () => {
  const reference = buildFindingsDigest({ findings: baseFindings() });
  const shuffled = [baseFindings()[2], baseFindings()[0], baseFindings()[1]];
  const reversed = baseFindings().slice().reverse();
  assert.equal(buildFindingsDigest({ findings: shuffled }).digest, reference.digest);
  assert.equal(buildFindingsDigest({ findings: reversed }).digest, reference.digest);
  // Property order inside a finding must not matter either.
  const reorderedProps = baseFindings().map((finding) => Object.fromEntries(Object.entries(finding).reverse()));
  assert.equal(buildFindingsDigest({ findings: reorderedProps }).digest, reference.digest);
});

test('3. a changed security finding changes the digest', () => {
  const reference = buildFindingsDigest({ findings: baseFindings() });
  for (const mutate of [
    (findings) => { findings[0].message = 'external specifier escaped the bundle boundary'; },
    (findings) => { findings[0].id = 'B21-1B'; },
    (findings) => { findings[0].category = 'reliability'; },
    (findings) => { findings.splice(1, 1); },
    (findings) => { findings.push({ id: 'B21-4', severity: 'medium', message: 'new finding' }); }
  ]) {
    const findings = baseFindings();
    mutate(findings);
    assert.notEqual(buildFindingsDigest({ findings }).digest, reference.digest, 'a genuine change must change the digest');
  }
});

test('4. a changed finding severity changes the digest', () => {
  const reference = buildFindingsDigest({ findings: baseFindings() });
  const findings = baseFindings();
  findings[0].severity = 'medium';
  assert.notEqual(buildFindingsDigest({ findings }).digest, reference.digest);
});

test('5. changed relevant source content changes the digest', () => {
  const reference = buildFindingsDigest({ findings: baseFindings() });
  const findings = baseFindings();
  findings[2].sourceSha256 = 'd'.repeat(64);
  assert.notEqual(buildFindingsDigest({ findings }).digest, reference.digest);
});

test('6. malformed findings are explicitly rejected with named codes', () => {
  const cases = [
    [{ findings: 'not-an-array' }, /FINDINGS_NOT_ARRAY/],
    [{ findings: [null] }, /FINDING_NOT_OBJECT/],
    [{ findings: [{ severity: 'high', message: 'x' }] }, /FINDING_ID_MISSING/],
    [{ findings: [{ id: 'a b', severity: 'high', message: 'x' }] }, /FINDING_ID_INVALID/],
    [{ findings: [{ id: 'a', message: 'x' }] }, /FINDING_SEVERITY_INVALID/],
    [{ findings: [{ id: 'a', severity: 'blocker', message: 'x' }] }, /FINDING_SEVERITY_INVALID/],
    [{ findings: [{ id: 'a', severity: 'high' }] }, /FINDING_MESSAGE_MISSING/],
    [{ findings: [{ id: 'a', severity: 'high', message: 'x', extra: () => 1 }] }, /NON_DETERMINISTIC_VALUE/],
    [{ findings: [{ id: 'a', severity: 'high', message: 'x', count: Number.NaN }] }, /NON_DETERMINISTIC_VALUE/],
    [{ findings: [{ id: 'a', severity: 'high', message: 'x' }, { id: 'a', severity: 'high', message: 'x' }] }, /FINDING_DUPLICATE/],
    [{ findings: [{ id: 'a', severity: 'high', message: 'x', path: '../escape' }] }, /PATH_ESCAPES_ROOT/],
    [{ findings: [], audit: 'nope' }, /AUDIT_NOT_OBJECT/]
  ];
  for (const [input, pattern] of cases) {
    assert.throws(() => buildFindingsDigest(input), (error) => {
      assert.match(String(error.message), /R37H_FINDINGS_MALFORMED:/);
      assert.match(String(error.message), pattern);
      return true;
    }, `expected rejection for ${JSON.stringify(input)}`);
  }
});

test('7. Linux/Windows path spellings of the same logical path digest identically', () => {
  const posix = buildFindingsDigest({
    findings: [{ id: 'P-1', severity: 'high', message: 'x', path: 'infrastructure/c3/build/worker-bundle.mjs' }]
  });
  const windows = buildFindingsDigest({
    findings: [{ id: 'P-1', severity: 'high', message: 'x', path: 'infrastructure\\c3\\build\\worker-bundle.mjs' }]
  });
  assert.equal(windows.digest, posix.digest);
  assert.equal(windows.findings[0].path, 'infrastructure/c3/build/worker-bundle.mjs');

  // Absolute spellings with drive letters and roots normalize to the same root-relative path.
  assert.equal(
    normalizePath('F:\\autolearnpro\\tests\\c3-recovery.test.mjs', { sourceRoot: 'F:\\autolearnpro' }),
    'tests/c3-recovery.test.mjs'
  );
  assert.equal(
    normalizePath('/home/reviewer/autolearnpro/tests/c3-recovery.test.mjs', { sourceRoot: '/home/reviewer/autolearnpro' }),
    'tests/c3-recovery.test.mjs'
  );
});

test('8. volatile execution metadata never enters the digest, and is retained for auditing', () => {
  const first = buildFindingsDigest({
    findings: baseFindings(),
    audit: { generatedAt: '2026-11-06T10:00:00.000Z', pid: 111, hostname: 'build-a', tempDir: 'C:\\Temp\\run-a' }
  });
  const second = buildFindingsDigest({
    findings: baseFindings(),
    audit: { generatedAt: '2026-11-07T23:59:59.000Z', pid: 999, hostname: 'build-b', tempDir: '/tmp/run-b' }
  });
  assert.equal(first.digest, second.digest, 'volatile metadata must not reach the digest');
  assert.equal(first.audit.pid, 111, 'audit metadata is retained separately');
  assert.equal(second.audit.hostname, 'build-b');
  assert.ok(!first.canonical.includes('generatedAt'), 'the canonical payload excludes volatile fields');
  // Volatile fields on a finding are lifted out of the facts; the resulting digest is stable.
  const withVolatile = buildFindingsDigest({
    findings: [{ id: 'V-1', severity: 'low', message: 'x', generatedAt: '2026-11-06T10:00:00.000Z' }]
  });
  const withoutVolatile = buildFindingsDigest({ findings: [{ id: 'V-1', severity: 'low', message: 'x' }] });
  assert.equal(withVolatile.digest, withoutVolatile.digest);
  assert.ok(!withVolatile.canonical.includes('2026-11-06'), 'volatile values never appear in canonical bytes');
});

test('9. verifyFindingsDigest recomputes honestly and detects tampering', () => {
  const built = buildFindingsDigest({ findings: baseFindings() });
  assert.equal(verifyFindingsDigest({ canonical: built.canonical, digest: built.digest }), true);
  assert.equal(verifyFindingsDigest({ canonical: built.canonical + ' ', digest: built.digest }), false);
  const tampered = built.digest.replace(/^./, (char) => (char === 'a' ? 'b' : 'a'));
  assert.equal(verifyFindingsDigest({ canonical: built.canonical, digest: tampered }), false);
  assert.throws(() => verifyFindingsDigest({ canonical: built.canonical, digest: 'not-a-digest' }), /DIGEST_INVALID/);
});
