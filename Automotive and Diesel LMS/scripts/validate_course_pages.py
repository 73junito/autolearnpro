#!/usr/bin/env python3
"""Validator for generated course pages.

Performs a set of checks to ensure a generated course page tree is valid:
- path exists
- index.md contains `title:` and `code:`
- modules and lessons referenced in CSVs (if available) exist

Exits with non-zero codes on failures to integrate with CI/tests.
"""
import argparse
from pathlib import Path
import sys
import csv


def read_csv_field(root: Path, pattern: str, field: str) -> set:
    p = root / pattern
    if not p.exists():
        # Try small variant
        alt = root / pattern.replace('.csv', '_small.csv')
        if alt.exists():
            p = alt
        else:
            return set()
    vals = set()
    with open(p, newline='', encoding='utf-8') as f:
        r = csv.DictReader(f)
        for row in r:
            v = row.get(field)
            if v:
                vals.add(v)
    return vals


def main():
    p = argparse.ArgumentParser()
    p.add_argument('path')
    p.add_argument('--strict', action='store_true')
    args = p.parse_args()

    base = Path(args.path)
    if not base.exists():
        print('Path does not exist:', base, file=sys.stderr)
        return 2

    # Basic index check
    idx = base / 'example-course' / 'index.md'
    if not idx.exists():
        print('Missing index.md at', idx, file=sys.stderr)
        return 3

    txt = idx.read_text(encoding='utf-8')
    if 'title:' not in txt or 'code:' not in txt:
        print('index.md missing required fields', file=sys.stderr)
        return 4

    # If CSVs exist, ensure referenced modules/lessons were created
    root = Path(__file__).resolve().parents[1] / 'scripts' / 'data'
    module_slugs = read_csv_field(root, 'modules.csv', 'module_slug')
    lesson_slugs = read_csv_field(root, 'lessons.csv', 'lesson_slug')

    errors = []
    modules_dir = base / 'example-course' / 'modules'
    lessons_dir = base / 'example-course' / 'lessons'

    for m in module_slugs:
        if not (modules_dir / f"{m}.md").exists():
            errors.append(f"Missing module: {m}")

    for l in lesson_slugs:
        if not (lessons_dir / f"{l}.md").exists():
            errors.append(f"Missing lesson: {l}")

    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        return 5

    print('Validation OK')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
#!/usr/bin/env python3
"""
Validator for course page markdown files.
Checks:
- Required YAML frontmatter present and parseable (needs PyYAML)
- Required keys (`title`, `slug`) exist
- Course index.md files: require `code`, `credits`, `duration_hours`, `level`
- Module files under `modules/`: require `module_id`, `sequence_number`
- Lesson files under `lessons/`: require `lesson_id`, `lesson_type`
- `slug` is kebab-case and unique across files
- Local image references exist
- Local markdown links point to existing files

Usage:
  python scripts/validate_course_pages.py [path] [--strict]

Example:
  python scripts/validate_course_pages.py scripts/docs/course_pages --strict

Exit codes:
  0 - all OK or only warnings (unless --strict)
  1 - errors found (or warnings when --strict is set)
  2 - missing dependency (PyYAML)

"""
import sys
import re
import os
from pathlib import Path
import argparse

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)
IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

REQUIRED_KEYS = ["title", "slug"]


def load_yaml(yaml_text):
    try:
        import yaml
    except Exception:
        print("ERROR: PyYAML is required to parse frontmatter. Install with: pip install pyyaml")
        sys.exit(2)
    try:
        return yaml.safe_load(yaml_text) or {}
    except Exception as e:
        print(f"ERROR: Failed to parse YAML frontmatter: {e}")
        return None


def validate_file(path: Path, root: Path):
    errors = []
    warnings = []
    text = path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        errors.append("Missing YAML frontmatter (--- ... ---) at top of file")
        return errors, warnings, None

    fm_text = m.group(1)
    fm = load_yaml(fm_text)
    if fm is None:
        errors.append("Invalid YAML frontmatter")
        return errors, warnings, None

    # Check required keys
    for key in REQUIRED_KEYS:
        if key not in fm:
            errors.append(f"Missing required frontmatter key: '{key}'")

    # Slug validation
    slug = fm.get("slug")
    if slug:
        if not SLUG_RE.match(str(slug)):
            warnings.append(f"slug '{slug}' does not follow kebab-case (lowercase, numbers, hyphens)")

    # Additional checks based on path (course index, module, lesson)
    rel = path.relative_to(root)
    parts = rel.parts
    # course index.md typically at <course-slug>/index.md
    if len(parts) >= 2 and parts[-1] == 'index.md':
        # course-level checks
        for ck in ['code', 'credits', 'duration_hours', 'level']:
            if ck not in fm:
                warnings.append(f"Course frontmatter missing recommended key: '{ck}'")
    # module files under modules/
    if 'modules' in parts:
        for mk in ['module_id', 'sequence_number']:
            if mk not in fm:
                warnings.append(f"Module frontmatter missing recommended key: '{mk}'")
    # lesson files under lessons/
    if 'lessons' in parts:
        for lk in ['lesson_id', 'lesson_type']:
            if lk not in fm:
                warnings.append(f"Lesson frontmatter missing recommended key: '{lk}'")

    # Check image references
    for img in IMAGE_RE.findall(text):
        img_path = img.split("#")[0].split("?")[0]
        if img_path.startswith("http://") or img_path.startswith("https://"):
            continue
        candidate = (path.parent / img_path).resolve()
        if not candidate.exists():
            errors.append(f"Image not found: {img_path}")

    # Check local markdown links
    for link in LINK_RE.findall(text):
        link_path = link.split("#")[0].split("?")[0]
        if link_path.startswith("http://") or link_path.startswith("https://"):
            continue
        if link_path.endswith('.md'):
            candidate = (path.parent / link_path).resolve()
            if not candidate.exists():
                errors.append(f"Linked markdown target not found: {link_path}")

    return errors, warnings, fm


def main():
    parser = argparse.ArgumentParser(description='Validate course page markdown files')
    parser.add_argument('path', nargs='?', default='scripts/docs/course_pages', help='Base path to course pages')
    parser.add_argument('--strict', action='store_true', help='Treat warnings as errors')
    args = parser.parse_args()

    base = Path(args.path)

    if not base.exists():
        print(f"ERROR: Path not found: {base}")
        sys.exit(1)

    md_files = list(base.rglob("*.md"))
    if not md_files:
        print(f"No markdown files found under: {base}")
        sys.exit(1)

    total_errors = 0
    total_warnings = 0
    slugs = {}

    for md in md_files:
        rel = md.relative_to(base)
        print(f"Checking: {rel}")
        errors, warnings, fm = validate_file(md, base)
        for w in warnings:
            print(f"  WARN: {w}")
            total_warnings += 1
        for e in errors:
            print(f"  ERROR: {e}")
            total_errors += 1
        if fm and "slug" in fm:
            s = str(fm.get("slug"))
            if s in slugs:
                print(f"  ERROR: Duplicate slug '{s}' found in {slugs[s]} and {rel}")
                total_errors += 1
            else:
                slugs[s] = rel

    print("\nSummary:")
    print(f"  Files checked: {len(md_files)}")
    print(f"  Errors: {total_errors}")
    print(f"  Warnings: {total_warnings}")

    if total_errors > 0 or (args.strict and total_warnings > 0):
        if args.strict and total_warnings > 0:
            print("Strict mode: treating warnings as errors.")
        print("Validation failed. Fix errors and re-run.")
        sys.exit(1)
    else:
        print("Validation passed (warnings may exist).")
        sys.exit(0)

if __name__ == '__main__':
    main()
