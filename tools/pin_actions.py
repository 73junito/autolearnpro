#!/usr/bin/env python3
"""
Pin GitHub Actions used in workflows to commit SHAs.
Scans .github/workflows/*.yml for lines like:
  uses: owner/repo@ref
Resolves ref (tag or branch) to a commit SHA using `gh api` and replaces the ref with the SHA.
Requires `gh` CLI authenticated with permissions to read public repos.

This script makes changes in-place and prints a summary. It does NOT commit by default.
To auto-commit, set --commit.
"""
import re
import subprocess
import json
from pathlib import Path
import argparse

# matches lines like: "  uses: owner/repo@ref"
USES_RE = re.compile(r"^(\s*uses:\s*)([\w\-.]+\/[\w\-.]+)@([^\s]+)\s*$")

WORKFLOWS = list(Path('.github/workflows').glob('*.yml')) + list(Path('.github/workflows').glob('*.yaml'))


def resolve_ref(owner_repo: str, ref: str):
    owner, repo = owner_repo.split('/')
    # try git/refs/tags/{ref}
    endpoints = [
        f"repos/{owner}/{repo}/git/refs/tags/{ref}",
        f"repos/{owner}/{repo}/releases/tags/{ref}",
        f"repos/{owner}/{repo}/git/refs/heads/{ref}",
    ]
    for ep in endpoints:
        try:
            r = subprocess.run(['gh', 'api', ep], capture_output=True, text=True, check=True)
            data = json.loads(r.stdout)
            # different shapes:
            if 'object' in data and 'sha' in data['object']:
                return data['object']['sha']
            if 'commit' in data and isinstance(data['commit'], dict) and 'sha' in data['commit']:
                return data['commit']['sha']
            if 'sha' in data:
                return data['sha']
        except subprocess.CalledProcessError:
            continue
    return None


def main(commit=False):
    changed_files = {}
    for wf in WORKFLOWS:
        text = wf.read_text(encoding='utf-8')
        lines = text.splitlines()
        new_lines = []
        changed = False
        for ln in lines:
            m = USES_RE.match(ln)
            if not m:
                new_lines.append(ln)
                continue
            prefix, owner_repo, ref = m.groups()
            # skip if ref already looks like a sha
            if re.fullmatch(r'[0-9a-f]{40}', ref):
                new_lines.append(ln)
                continue
            print(f"Resolving {owner_repo}@{ref} in {wf}")
            sha = resolve_ref(owner_repo, ref)
            if sha:
                new_ln = f"{prefix}{owner_repo}@{sha}"
                new_lines.append(new_ln)
                changed = True
                print(f"  -> {sha}")
            else:
                print(f"  ! could not resolve {owner_repo}@{ref}")
                new_lines.append(ln)
        if changed:
            new_text = '\n'.join(new_lines) + '\n'
            wf.write_text(new_text, encoding='utf-8')
            changed_files[str(wf)] = True
    if changed_files:
        print('\nPinned actions in files:')
        for f in changed_files:
            print(' -', f)
        if commit:
            subprocess.run(['git', 'add'] + list(changed_files.keys()), check=True)
            subprocess.run(['git', 'commit', '-m', 'ci: pin GitHub Action refs to commit SHAs'], check=True)
            subprocess.run(['git', 'push', 'origin', 'HEAD'], check=True)
            print('Committed and pushed changes')
    else:
        print('No actions resolved/pinned')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--commit', action='store_true', help='Commit and push changes')
    args = p.parse_args()
    main(commit=args.commit)
