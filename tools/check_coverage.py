#!/usr/bin/env python3
"""Small helper to validate coverage JSON and enforce a numeric threshold.

Usage:
  python3 tools/check_coverage.py <path-to-excoveralls.json> [threshold]

Exits 0 on success or when skipping is appropriate, exits 1 when coverage
is present but below the threshold.
"""
import json
import sys
import os


def main(argv):
    if len(argv) < 2:
        print("Usage: check_coverage.py <coverage_json> [threshold]")
        return 0

    path = argv[1]
    try:
        threshold = float(argv[2]) if len(argv) > 2 else 70.0
    except Exception:
        threshold = 70.0

    if not path or not isinstance(path, str):
        print("No coverage path provided; skipping.")
        return 0
    # If the coverage file is missing, only skip when explicitly allowed.
    if not os.path.exists(path):
        print(f"Coverage JSON not found at {path}.")
        if os.environ.get("COVERAGE_OPTIONAL", "0") == "1":
            print("Skipping coverage threshold check (COVERAGE_OPTIONAL=1)")
            return 0
        print("Coverage JSON missing and coverage is required; failing.")
        return 1

    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        print(f"Coverage JSON not found at {path} (FileNotFoundError).")
        if os.environ.get("COVERAGE_OPTIONAL", "0") == "1":
            print("Skipping coverage threshold check (COVERAGE_OPTIONAL=1)")
            return 0
        return 1
    except json.JSONDecodeError as e:
        print(f"Coverage JSON malformed: {e}")
        return 1
    except Exception as e:
        print(f"Unexpected error reading coverage JSON: {e}")
        return 1

    # Explicitly check keys so that a legitimate 0 coverage does not get
    # treated as falsy (avoid using `or` chains which treat 0 as False).
    cov_value = None
    for key in ("coverage", "coverage_percent", "total_coverage"):
        if key in data:
            cov_value = data[key]
            break

    if cov_value is None:
        print("Coverage key not found in JSON; failing.")
        return 1

    try:
        cov = float(cov_value)
    except Exception as e:
        print(f"Coverage value is not numeric: {e}")
        return 1

    print(f"Current coverage: {cov}%")
    if cov < threshold:
        print(f"Coverage ({cov}%) is below threshold ({threshold}%)")
        return 1

    print(f"Coverage ({cov}%) meets threshold ({threshold}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
