Purpose

This document collects the safe, actionable steps to remediate the CI integrity risks we identified:

1. Remove or migrate large files in repository history (files >100MB) that block pushes.
2. Mark large binary patterns with Git LFS and update .gitattributes.
3. Verify required repo secrets and branch protection after the code changes are merged.

Do not run destructive history-rewrite steps without coordination. Back up the repository first.

Option A — Safe (recommended)

1. Identify large files in history locally:
   - Install `git-sizer` or use `git rev-list` techniques. Example:
     git rev-list --objects --all \
       | sed -n '1,200000p' \
       | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
       | sort -k3 -n -r \
       | head -n 50

2. For each large file you want to keep, move it into Git LFS (recommended) or delete it.
   - To move an existing file into Git LFS for future commits (won't rewrite history):
     git lfs install --local
     git lfs track "downloads/*.zip"
     git add .gitattributes
     git add <large-files> && git commit -m "chore: move files to git-lfs"
     git push

3. If large files are only untracked or present locally (not in history), add them to .gitignore and do not commit.

Option B — History rewrite (destructive; coordinate and force-push)

Use BFG Repo-Cleaner (simpler) or git-filter-repo (recommended). Both rewrite history and require all collaborators to re-clone or run recovery steps.

BFG approach (example):

1. Backup:
   git clone --mirror https://github.com/<owner>/<repo>.git backup-repo.git

2. Run BFG to delete files by name/pattern:
   bfg --delete-files 'pgadmin4.zip' backup-repo.git
   bfg --delete-files 'next-swc*.node' backup-repo.git
   bfg --delete-folders '.vs' backup-repo.git

3. Clean and push:
   cd backup-repo.git
   git reflog expire --expire=now --all && git gc --prune=now --aggressive
   git push --force

git-filter-repo approach (recommended):

1. Install git-filter-repo (https://github.com/newren/git-filter-repo)
2. Run: (from a fresh clone)
   git clone --mirror https://github.com/<owner>/<repo>.git repo.git
   cd repo.git
   git filter-repo --invert-paths --paths downloads/pgadmin4.zip --paths frontend/web/node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node
   git push --force

Post-rewrite steps for collaborators

- Instruct all collaborators to re-clone the repository after the forced push, or follow the recommended rebase steps in the BFG docs.
- Rotate any secrets that may have been exposed by the removed files.

Branch protection and secrets

- Add branch protection rules for `main` requiring status checks (Elixir CI and publish-image) and require PR reviews.
- Verify repository secrets:
  - `GITHUB_TOKEN` is provided automatically for Actions; ensure `packages: write` permission in workflows when publishing.
  - `KUBECONFIG_DATA` (if using deploy job) must be set in repository secrets.

If you want me to prepare the exact BFG or git-filter-repo commands for this repository, tell me which filenames/patterns to remove and I will create a script. If you confirm, I can also:
- create a branch with .gitattributes (already added)
- prepare a patch/PR that removes any tracked large files (non-history rewrite) where possible.

Warning

History rewrite is destructive. Only proceed if you understand the impact and have coordinated with collaborators.
