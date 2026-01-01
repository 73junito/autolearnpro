#!/usr/bin/env python3
"""
Additional workflow checks (heuristic, text-based) for .github/workflows/*.yml
- Ensures 'jobs:' exists
- Warns if file contains 'jobs:' but no 'runs-on:' occurrences
- Errors if known Dockerfile paths referenced are missing
- Errors if invalid expressions like 'github.event.pull_request.changed_files' are present
- Detect duplicate top-level keys

Exit codes:
 0 = OK (no critical errors)
 1 = Warnings present
 2 = Errors present
"""
import sys
from pathlib import Path
import re

WORKFLOWS = list(Path('.github/workflows').glob('*.yml')) + list(Path('.github/workflows').glob('*.yaml'))
CRITICAL_ERRORS = []
WARNINGS = []

# include both root and repo-subfolder references
DOCKER_PATHS = {
    'backend/lms_api/Dockerfile': [Path('backend/lms_api/Dockerfile'), Path('Automotive and Diesel LMS/backend/lms_api/Dockerfile')],
    'docker/lms-api/Dockerfile.release': [Path('docker/lms-api/Dockerfile.release'), Path('Automotive and Diesel LMS/docker/lms-api/Dockerfile.release')],
    './Dockerfile': [Path('Dockerfile'), Path('Automotive and Diesel LMS/Dockerfile')],
}

if not Path('.github/workflows').exists():
    print('No .github/workflows directory found; aborting extra checks.')
    sys.exit(0)

for f in WORKFLOWS:
    text = f.read_text(encoding='utf-8')
    print(f'Checking {f} ...')
    # duplicate top-level keys
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
            if key in ('-', '---'):
                continue
            top_keys.append(key)
    dupes = set([k for k in top_keys if top_keys.count(k) > 1])
    if dupes:
        CRITICAL_ERRORS.append(f'{f}: duplicate top-level keys: {", ".join(sorted(dupes))}')

    if 'name:' not in text:
        WARNINGS.append(f'{f}: missing top-level name')

    if 'jobs:' not in text:
        CRITICAL_ERRORS.append(f'{f}: missing top-level jobs:')
        continue

    # runs-on heuristic
    runs_on_count = len(re.findall(r"^\s*runs-on:\s*", text, flags=re.MULTILINE))
    if runs_on_count == 0:
        WARNINGS.append(f'{f}: no runs-on: detected (jobs might be missing runs-on)')

    # steps heuristic: ensure at least one 'uses:' or 'run:' exists anywhere in the file when steps are declared
    if 'steps:' in text:
        if not (re.search(r"\buses\s*:", text) or re.search(r"\brun\s*:", text)):
            WARNINGS.append(f'{f}: steps declared but could not find any step run/uses lines (heuristic)')

    # invalid changed_files usage
    if 'github.event.pull_request.changed_files' in text:
        CRITICAL_ERRORS.append(f"{f}: contains 'github.event.pull_request.changed_files' which is not usable in 'if' expressions")

    # dockerfile references
    for ref, path_list in DOCKER_PATHS.items():
        if ref in text:
            if not any(p.exists() for p in path_list):
                CRITICAL_ERRORS.append(f"{f}: references {ref} but none of {', '.join(str(p) for p in path_list)} exist in repo")

    # referenced scripts existence
    # capture full script paths (e.g. ./scripts/foo.sh or scripts/foo.py or tools/foo.py)
    script_paths = re.findall(r"(?:\./|scripts/|tools/)[A-Za-z0-9_\-\./ ]+\.(?:sh|py|ps1)", text)
    for sp in script_paths:
        sp_stripped = sp.strip().strip('"')
        candidates = [Path(sp_stripped), Path('Automotive and Diesel LMS') / Path(sp_stripped)]
        if not any(c.exists() for c in candidates):
            WARNINGS.append(f"{f}: referenced script {sp_stripped} not found (checked repo root and 'Automotive and Diesel LMS' subfolder)")

# print results
if CRITICAL_ERRORS:
    print('\nErrors:')
    for e in CRITICAL_ERRORS:
        print('  -', e)
else:
    print('\nNo critical errors detected.')

if WARNINGS:
    print('\nWarnings:')
    for w in WARNINGS:
        print('  -', w)
else:
    print('\nNo warnings detected.')

if CRITICAL_ERRORS:
    print('\nExtra validation FAILED')
    sys.exit(2)
elif WARNINGS:
    print('\nExtra validation completed with warnings')
    sys.exit(1)
else:
    print('\nExtra validation passed cleanly')
    sys.exit(0)
