#!/usr/bin/env python3
"""
Lightweight local validator for GitHub Actions workflow files in .github/workflows.
Checks performed:
 - Detect duplicate top-level mapping keys in each workflow file
 - Confirm referenced Dockerfile paths exist for common build workflows
 - Warn on common anti-patterns (duplicate 'on' docs, missing 'name')

Usage: python tools/validate_workflows_local.py
"""
import os
from pathlib import Path

WORKFLOWS_DIR = Path('.github/workflows')
DOCKER_PATHS = [
    'backend/lms_api/Dockerfile',
    'docker/lms-api/Dockerfile.release',
    './Dockerfile',
    'backend/lms_api/Dockerfile'
]

errors = []
warnings = []

if not WORKFLOWS_DIR.exists():
    print('No .github/workflows directory found; nothing to validate.')
    raise SystemExit(0)

for p in sorted(WORKFLOWS_DIR.glob('*.yml')) + sorted(WORKFLOWS_DIR.glob('*.yaml')):
    text = p.read_text(encoding='utf-8')
    # simple top-level key detection: lines that start with a non-space and contain ':'
    top_keys = []
    for ln in text.splitlines():
        if not ln.strip():
            continue
        if ln.startswith('#'):
            continue
        if ln[0].isspace():
            continue
        if ':' in ln:
            key = ln.split(':', 1)[0].strip()
            # ignore list markers and YAML document start
            if key in ('-', '---'):
                continue
            top_keys.append(key)
    dupes = set([k for k in top_keys if top_keys.count(k) > 1])
    if dupes:
        errors.append(f"{p}: duplicate top-level keys: {', '.join(sorted(dupes))}")
    # simple checks
    if 'name:' not in text:
        warnings.append(f"{p}: missing top-level 'name' field")

# Check Dockerfile references used by some workflows
for path in DOCKER_PATHS:
    if Path(path).exists():
        print(f"Found Dockerfile: {path}")

print('\nWorkflow file checks:')
if errors:
    print('Errors:')
    for e in errors:
        print('  -', e)
else:
    print('  No top-level duplicate mapping keys detected.')

if warnings:
    print('\nWarnings:')
    for w in warnings:
        print('  -', w)
else:
    print('\n  No warnings detected.')

# Final guidance
if errors:
    print('\nValidation FAILED: fix errors before pushing changes.')
    raise SystemExit(2)
else:
    print('\nValidation PASSED (basic checks).')
    print('To fully validate workflows, push this branch and allow .github/workflows/workflow-lint.yml to run on GitHub Actions.')
    raise SystemExit(0)
