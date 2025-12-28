#!/usr/bin/env python3
"""Quick HTML lint for course site index.html files.

Checks each `content/courses/*/site/index.html` for:
 - presence of `<h2>Contents</h2>`
 - presence of an element with class `course-hero`
 - presence of `id="nav-root"`
 - presence of closing `</body>` tag

Writes a brief CSV-style report to `outputs/html_lint_report.csv` and prints a summary.
"""
from pathlib import Path
import csv

ROOT = Path('content/courses')
OUT = Path('outputs')
OUT.mkdir(exist_ok=True)
REPORT = OUT / 'html_lint_report.csv'

files = sorted(ROOT.glob('*/site/index.html'))
rows = []
for p in files:
    text = p.read_text(encoding='utf-8', errors='replace')
    has_contents = '<h2>Contents</h2>' in text
    has_hero = 'class="course-hero"' in text or "class='course-hero'" in text
    has_navroot = 'id="nav-root"' in text or "id='nav-root'" in text
    has_body_close = '</body>' in text.lower()
    rows.append({
        'file': str(p),
        'has_contents': int(has_contents),
        'has_course_hero': int(has_hero),
        'has_nav_root': int(has_navroot),
        'has_body_close': int(has_body_close),
    })

with REPORT.open('w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=['file','has_contents','has_course_hero','has_nav_root','has_body_close'])
    writer.writeheader()
    for r in rows:
        writer.writerow(r)

total = len(rows)
missing_hero = sum(1 for r in rows if not r['has_course_hero'])
missing_nav = sum(1 for r in rows if not r['has_nav_root'])
missing_contents = sum(1 for r in rows if not r['has_contents'])
missing_body = sum(1 for r in rows if not r['has_body_close'])

print(f'Checked {total} files — missing_course_hero={missing_hero}, missing_nav_root={missing_nav}, missing_contents={missing_contents}, missing_body_close={missing_body}')
print(f'Report written to {REPORT}')

if __name__ == '__main__':
    pass
