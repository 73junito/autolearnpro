#!/usr/bin/env bash
# Small ollama shim installer for CI runners.
# Installs a lightweight shell stub at $HOME/bin/ollama and adds $HOME/bin to $GITHUB_PATH.

set -euo pipefail

DEST_DIR="$HOME/bin"
DEST="$DEST_DIR/ollama"

mkdir -p "$DEST_DIR"

cat > "$DEST" <<'SH'
#!/usr/bin/env bash
# Minimal ollama shim used on CI when the real `ollama` binary is not available.
# This intentionally provides a small, predictable surface so tests that call
# `ollama` don't fail the whole job when the binary is optional.

cmd="$1"
shift || true

case "$cmd" in
  run|generate|chat)
    echo "ollama: command '$cmd' is not available on this runner (shim)" >&2
    exit 2
    ;;
  list|ps)
    # Some CI checks call `ollama ps` or `ollama list` to see models/runs.
    # Mimic real behavior:
    #   - default: no output (empty list)
    #   - with --json: return an empty JSON array
    for arg in "$@"; do
      if [ "$arg" = "--json" ]; then
        echo "[]"
        exit 0
      fi
    done
    # No --json requested: succeed with no output
    exit 0
    ;;
  *)
    echo "ollama: shim received unsupported subcommand: $cmd" >&2
    exit 2
    ;;
esac
SH

chmod +x "$DEST"

# Add $HOME/bin to PATH for the remainder of the job via GITHUB_PATH
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$DEST_DIR" >> "$GITHUB_PATH"
else
  # Fallback for local runs: export PATH in current shell.
  # Note: when this script is executed (not sourced), this change does not
  # persist in the parent shell. To use the shim in new shells, add $DEST_DIR
  # to your PATH in your shell profile (e.g. ~/.bashrc, ~/.zshrc).
  export PATH="$DEST_DIR:$PATH"
  echo "For future shells, add the following to your shell profile (e.g. ~/.bashrc):"
  echo "  export PATH=\"$DEST_DIR:\$PATH\""
fi

echo "Installed ollama shim to $DEST"
