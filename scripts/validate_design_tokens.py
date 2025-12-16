#!/usr/bin/env python3
"""Small validator for `branding/design-tokens.json`.

Checks presence of top-level `color` and `typography` keys and verifies
that color values are hex strings like `#RRGGBB` or `#RGB`.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKENS = ROOT / "branding" / "design-tokens.json"

HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def load_tokens(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"ERROR: failed to read {path}: {e}")
        sys.exit(2)


def main() -> int:
    if not TOKENS.exists():
        print(f"ERROR: {TOKENS} not found")
        return 2

    data = load_tokens(TOKENS)

    ok = True

    # Basic required keys
    for key in ("color", "typography"):
        if key not in data:
            print(f"ERROR: missing top-level key: {key}")
            ok = False

    # Validate colors
    colors = data.get("color", {})
    if isinstance(colors, dict):
        for name, val in colors.items():
            if not isinstance(val, str) or not HEX_RE.match(val):
                print(f"ERROR: color '{name}' has invalid value: {val}")
                ok = False

    if not ok:
        return 1

    print(f"OK: {TOKENS.name} validates against basic rules")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
