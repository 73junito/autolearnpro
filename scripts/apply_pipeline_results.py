#!/usr/bin/env python3
import argparse
from pathlib import Path
import shutil
import sys

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True, help='Source polished file')
ap.add_argument('--dst', required=True, help='Destination stub markdown file')
args = ap.parse_args()

src = Path(args.src)
dst = Path(args.dst)
if not src.exists():
    print(f'Source not found: {src}', file=sys.stderr)
    sys.exit(2)

# Ensure destination directory exists
if not dst.parent.exists():
    print(f'Destination directory missing, creating: {dst.parent}')
    dst.parent.mkdir(parents=True, exist_ok=True)

# Backup existing dst
if dst.exists():
    bak = dst.with_suffix(dst.suffix + '.bak')
    shutil.copy2(dst, bak)
    print(f'Backed up {dst} -> {bak}')

# Read source and write to dst
text = src.read_text(encoding='utf-8')
# Optionally add a header indicating auto-generated
header = ('<!-- AUTO-GENERATED: Polished by ollama_pipeline.py - review and edit as needed -->\n\n')
# If dst already exists and contains frontmatter, preserve it
# Simple heuristic: if file starts with '---' treat as frontmatter
existing = dst.read_text(encoding='utf-8') if dst.exists() else ''
if existing.startswith('---'):
    # find end of frontmatter
    parts = existing.split('\n---\n', 1)
    if len(parts) == 2:
        frontmatter, rest = parts
    else:
        frontmatter = existing
        rest = ''
    new_content = frontmatter + '\n---\n\n' + header + text
else:
    new_content = header + text

dst.write_text(new_content, encoding='utf-8')
print(f'Wrote polished content to {dst}')
