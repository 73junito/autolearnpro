#!/usr/bin/env python3
"""Quality assurance check script."""

import sys

def check_file(filepath):
    """Check a file for quality issues."""
    with open(filepath) as f:
        for line_num, line in enumerate(f, 1):
            if len(line.rstrip()) > 100:
                print(f"{filepath}:{line_num}: Line too long ({len(line.rstrip())} > 100)")
                return False
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: qa_check.py <file>")
        sys.exit(1)
    
    success = check_file(sys.argv[1])
    sys.exit(0 if success else 1)
