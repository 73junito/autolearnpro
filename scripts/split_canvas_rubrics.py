#!/usr/bin/env python3
from pathlib import Path
import csv

infile = Path('outputs/canvas_rubrics.csv')
outdir = Path('outputs/canvas_by_course')
outdir.mkdir(parents=True, exist_ok=True)
if not infile.exists():
    raise SystemExit('Missing outputs/canvas_rubrics.csv')
rows_by_course = {}
with infile.open(encoding='utf8', newline='') as f:
    r = csv.DictReader(f)
    header = r.fieldnames
    for row in r:
        course = row.get('course') or 'unknown'
        rows_by_course.setdefault(course, []).append(row)
# write per-course files
manifest = []
for course, rows in rows_by_course.items():
    safe = course.replace(' ', '_')
    out = outdir / f'{safe}_rubrics.csv'
    with out.open('w', encoding='utf8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        w.writerows(rows)
    manifest.append(str(out))
# write manifest
m = outdir / 'manifest.txt'
m.write_text('\n'.join(manifest), encoding='utf8')
print('WROTE', len(manifest), 'files to', outdir)
