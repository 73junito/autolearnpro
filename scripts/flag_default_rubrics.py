#!/usr/bin/env python3
import csv
from pathlib import Path
src = Path('outputs/rubrics_summary.csv')
out = Path('outputs/rubrics_needs_review.csv')
if not src.exists():
    raise SystemExit('Missing outputs/rubrics_summary.csv')
rows=[]
with src.open(encoding='utf8') as f:
    r = csv.DictReader(f)
    for row in r:
        if row.get('used_default_criteria','').lower() in ('yes','true'):
            rows.append(row)
out.parent.mkdir(exist_ok=True)
with out.open('w', newline='', encoding='utf8') as f:
    w = csv.DictWriter(f, fieldnames=r.fieldnames)
    w.writeheader()
    w.writerows(rows)
print('WROTE', out, 'count=', len(rows))
