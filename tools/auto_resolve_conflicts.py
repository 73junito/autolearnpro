#!/usr/bin/env python3
"""
Auto-resolve simple merge conflicts by choosing 'ours' (the content between )
for any file containing conflict markers. Use with caution.
"""
from pathlib import Path
import sys

root = Path('.')
files = list(root.rglob('*'))
changed = []
for f in files:
    if not f.is_file():
        continue
    try:
        text = f.read_text(encoding='utf-8')
    except Exception:
        continue
    if '' in text:
        print(f'Processing conflict in: {f}')
        parts = text.split('        out = parts[0]
        for p in parts[1:]:
            # p starts with something like ' HEAD\n...'; find ' branch'
                # We want to keep 'ours' followed by the remaining text after the closing '>>>>>>>' if present
                if '>>>>>>>' in rest:
                    _, after = rest.split('>>>>>>>', 1)
                else:
                    # if no end marker, keep rest as-is
                    after = rest
                out += ours + after
            else:
                # malformed, just include as-is
                out += '<<<<<<<' + p
        f.write_text(out, encoding='utf-8')
        changed.append(str(f))

if changed:
    print('\nFiles modified:')
    for c in changed:
        print(' -', c)
else:
    print('No conflict markers found.')

if changed:
    print('\nNow run: git add <files> && git commit -m "chore: auto-resolve merge conflicts (keep ours)"')
else:
    print('Nothing to commit.')
