#!/usr/bin/env bash
set -euo pipefail

# List the top 50 largest objects in the repository history (blob objects)
# Usage: ./scripts/find-largest-git-objects.sh

printf "Finding largest git objects (top 50)...\n\n"

# Ensure we're in a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not a git repository"
  exit 1
fi

# Produce list: size (bytes) and path
git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob" { printf "%s %s\n", $3, substr($0, index($0,$4)) }' \
  | sort -nr | head -n 50

printf "\nDone. Review the list and add patterns you want removed to a filter list.\n" 
