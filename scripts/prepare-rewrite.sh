#!/usr/bin/env bash
set -euo pipefail

# WARNING: This script rewrites git history. Run only after coordinating with collaborators.
# Usage: run from repo root. It creates a temporary mirror, runs git-filter-repo to remove paths listed in scripts/paths-to-remove.txt, and force pushes.

if [ ! -f scripts/paths-to-remove.txt ]; then
  echo "Expected scripts/paths-to-remove.txt with paths to remove."
  exit 1
fi

REPO_URL=$(git config --get remote.origin.url)
if [ -z "$REPO_URL" ]; then
  echo "Could not determine origin URL"
  exit 1
fi

TMPDIR=$(mktemp -d)
mirror_dir="$TMPDIR/repo.git"

echo "Cloning mirror into $mirror_dir..."
git clone --mirror "$REPO_URL" "$mirror_dir"

cd "$mirror_dir"

echo "Running git-filter-repo to remove listed paths..."
# Build arguments for --invert-paths
args=()
while IFS= read -r p; do
  p_trimmed=$(echo "$p" | sed 's/^\s*//;s/\s*$//')
  [ -z "$p_trimmed" ] && continue
  args+=(--invert-paths --paths "$p_trimmed")
done < ../working-copy/scripts/paths-to-remove.txt

# If git-filter-repo not available, exit with a message
if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo not found. Install it from https://github.com/newren/git-filter-repo and re-run."
  exit 1
fi

# Run git-filter-repo
git filter-repo "${args[@]}"

# Cleanup and push
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "Force pushing cleaned repo to origin. This will rewrite history."
read -p "Type 'yes' to confirm force-push to origin: " confirm
if [ "$confirm" = "yes" ]; then
  git push --force --all
  git push --force --tags
  echo "Push complete. Notify collaborators to re-clone."
else
  echo "Aborted by user. Temporary mirror is at $mirror_dir"
fi
