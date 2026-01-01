#!/usr/bin/env python3
"""
Resolve git merge conflicts by keeping the 'ours' side (content between the conflict marker and the ======= line).
Operates on files reported by `git ls-files -u` (unmerged). Use with caution.
"""
import subprocess
import re
from pathlib import Path

# Get unmerged files from git using -z to safely handle filenames with spaces
res = subprocess.run(['git','ls-files','-u','-z'], capture_output=True, text=False)
if res.returncode != 0:
    print('git ls-files -u -z failed')
    raise SystemExit(1)

raw = res.stdout
if not raw:
    print('No unmerged files found')
    raise SystemExit(0)

# Split NUL-separated entries into lines; git ls-files -u -z outputs entries like:
# "<mode> <sha> <stage>\t<path>\0"
entries = raw.split(b'\0')
paths = []
entry_re = re.compile(rb"^\d+\s+[0-9a-fA-F]+\s+\d\t(.+)$")
for e in entries:
    if not e:
        continue
    m = entry_re.match(e)
    if not m:
        # skip malformed
        continue
    p = m.group(1).decode('utf-8', errors='surrogateescape')
    paths.append(p)

paths = sorted(set(paths))
if not paths:
    print('No unmerged files found')
    raise SystemExit(0)

conflict_re = re.compile(r'<<<<<<<.*?\n(.*?)\n=======\n(.*?)\n>>>>>>>.*?\n', re.S)
modified = []
for p in paths:
    fp = Path(p)
    if not fp.exists():
        print(f'File missing from worktree, skipping: {p}')
        # still try to mark as added/removed appropriately
        try:
            subprocess.run(['git','add',p], check=False)
        except Exception:
            pass
        continue
    text = fp.read_text(encoding='utf-8', errors='surrogatepass')
    if '<<<<<<<' not in text:
        print(f'No conflict markers in {p}, adding as resolved')
        subprocess.run(['git','add',p])
        continue
    new = text
    # Replace each conflict block with the 'ours' group (group 1)
    def repl(m):
        ours = m.group(1)
        return ours + '\n'
    new2 = conflict_re.sub(repl, new)
    if new2 == text:
        print(f'Could not parse conflict blocks in {p}, skipping')
        continue
    fp.write_text(new2, encoding='utf-8', errors='surrogatepass')
    subprocess.run(['git','add',p])
    modified.append(p)

if modified:
    print('Modified files:')
    for m in modified:
        print(' -', m)
    # commit
    rc = subprocess.run(['git','commit','-m','chore(ci): resolve merge conflicts (keep ours)'])
    if rc.returncode == 0:
        print('Committed resolution')
        subprocess.run(['git','push','origin','HEAD'])
    else:
        print('Commit failed; please resolve remaining conflicts manually')
else:
    print('No files modified')
