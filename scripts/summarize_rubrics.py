#!/usr/bin/env python3
from pathlib import Path
import csv

root = Path('content/courses')
out = Path('outputs/rubrics_summary.csv')
rows = []
def is_default_criteria(criteria):
    defaults = set(['Understanding of core concepts','Correct application of procedures','Safety and professionalism'])
    return set(criteria) <= defaults

for course_dir in sorted(root.iterdir() if root.exists() else []):
    if not course_dir.is_dir():
        continue
    modules_root = course_dir / 'modules'
    if not modules_root.exists():
        modules_root = course_dir / 'site' / 'modules'
    if not modules_root.exists():
        continue
    for mod_dir in sorted([p for p in modules_root.iterdir() if p.is_dir()]):
        rubric_f = mod_dir / 'rubric.md'
        if not rubric_f.exists():
            continue
        try:
            txt = rubric_f.read_text(encoding='utf8')
        except Exception:
            txt = ''
        # find criteria headings '### '
        criteria = []
        for line in txt.splitlines():
            if line.strip().startswith('### '):
                criteria.append(line.strip()[4:].strip())
        used_defaults = 'yes' if is_default_criteria(criteria) else 'no'
        sample = '; '.join(criteria[:3])
        rows.append([course_dir.name, mod_dir.name, str(rubric_f), len(criteria), used_defaults, sample])

out.parent.mkdir(exist_ok=True)
with out.open('w', newline='', encoding='utf8') as f:
    w = csv.writer(f)
    w.writerow(['course','module','rubric_path','criteria_count','used_default_criteria','criteria_sample'])
    w.writerows(rows)
print('WROTE', out)
