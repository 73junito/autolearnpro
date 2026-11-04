#!/bin/sh
# C3-R25 — verify every `uses:` reference is pinned to an immutable ref.
#
# POSIX sh + POSIX ERE only. Deliberately avoids GNU/PCRE extensions such as \s and \b:
# `\s` is not part of POSIX ERE and is not portable across grep implementations
# (GNU grep accepts it in some modes, busybox and BSD grep do not).
#
# Usage: sh verify-action-pinning.sh <workflow.yml> [more.yml ...]
# Exit:  0 all references pinned | 1 unpinned/invalid/unreadable | 2 usage error

set -u

if [ "$#" -eq 0 ]; then
  printf 'usage: %s <workflow.yml> [more.yml ...]\n' "$0" >&2
  exit 2
fi

tmpfile=${TMPDIR:-/tmp}/alp-action-pinning.$$
trap 'rm -f "$tmpfile"' EXIT HUP INT TERM

failures=0
checked=0

# Returns 0 when the reference is acceptable, 1 otherwise.
check_ref() {
  ref=$1
  case $ref in
    ./|../*|./*)
      # Repository-controlled composite action: its content is covered by code review.
      return 0
      ;;
    docker://*)
      case $ref in
        *@sha256:*)
          digest=${ref##*@sha256:}
          printf '%s' "$digest" | grep -qE '^[0-9a-f]{64}$' && return 0
          ;;
      esac
      printf 'FAIL docker reference not digest-pinned: %s\n' "$ref" >&2
      return 1
      ;;
    *@*)
      sha=${ref##*@}
      printf '%s' "$sha" | grep -qE '^[0-9a-f]{40}$' && return 0
      printf 'FAIL not a 40-character commit SHA: %s\n' "$ref" >&2
      return 1
      ;;
    *)
      printf 'FAIL uses: without @ref: %s\n' "$ref" >&2
      return 1
      ;;
  esac
}

for file in "$@"; do
  if [ ! -f "$file" ]; then
    printf 'FAIL unreadable file: %s\n' "$file" >&2
    failures=$((failures + 1))
    continue
  fi

  # POSIX whitespace is [[:space:]]; a leading "- name:" list marker is stripped too.
  grep -nE '^[[:space:]]*(-[[:space:]]+)?uses:' "$file" \
    | sed -e 's/^[0-9]*:[[:space:]]*//' \
          -e 's/^-[[:space:]]*//' \
          -e 's/^uses:[[:space:]]*//' \
          -e 's/^['"'"'"]//' \
          -e 's/['"'"'"][[:space:]]*$//' \
          -e 's/[[:space:]].*$//' \
    > "$tmpfile" || true

  # Read from a file rather than a pipe: a pipeline would run the loop in a subshell and
  # the failure counter would be discarded.
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    checked=$((checked + 1))
    if ! check_ref "$ref"; then
      failures=$((failures + 1))
      printf '  ^ in %s\n' "$file" >&2
    fi
  done < "$tmpfile"
done

if [ "$failures" -gt 0 ]; then
  printf 'RESULT: FAIL — %d unpinned reference(s) across %d checked\n' "$failures" "$checked" >&2
  exit 1
fi

printf 'RESULT: PASS — %d reference(s) pinned to immutable refs\n' "$checked"
exit 0
