#!/usr/bin/env python3
from pathlib import Path
import csv
import re

root = Path('content/courses')
out = Path('outputs/canvas_rubrics.csv')
rows = []

def extract_rubric_items(text):
    # returns list of (criterion_title, list_of_levels[(name,points,desc)])
    items = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith('### '):
            crit = line.strip()[4:].strip()
            i += 1
            # collect block until next ###
            block = []
            while i < len(lines) and not lines[i].strip().startswith('### '):
                block.append(lines[i])
                i += 1
            # find table rows like | Level | Description |
            level_rows = []
            for bl in block:
                bl = bl.strip()
                if bl.startswith('|') and '|' in bl[1:]:
                    parts = [p.strip() for p in bl.split('|')]
                    # ignore header separator lines
                    if re.match(r'^-+\s*$', ''.join(parts)):
                        continue
                    # requires at least 3 columns
                    if len(parts) >= 3:
                        lvl = parts[1]
                        desc = parts[2]
                        # extract points from lvl like 'Exemplary (4)'
                        m = re.search(r'\((\d+)\)', lvl)
                        pts = int(m.group(1)) if m else None
                        level_rows.append((lvl, pts, desc))
            # if level_rows empty, try to infer from plain text bullets in block
            if not level_rows:
                bullets = [re.sub(r'^[-*]\s*','',b).strip() for b in block if re.match(r'^[\-\*]\s+', b)]
                # assign generic levels
                pts = [4,3,2,1]
                lr = []
                for idx, b in enumerate(bullets[:4]):
                    lvl_name = f'Level {4-idx} ({4-idx})'
                    lr.append((lvl_name, pts[idx], b))
                level_rows = lr
            items.append((crit, level_rows))
        else:
            i += 1
    return items

for course_dir in sorted(root.iterdir() if root.exists() else []):
    if not course_dir.is_dir():
        continue
    # find course-level rubric
    course_rub = course_dir / 'rubric.md'
    if course_rub.exists():
        txt = course_rub.read_text(encoding='utf8')
        title = ''
        m = re.search(r'^#\s*(.+)$', txt, re.M)
        if m:
            title = m.group(1).strip()
        items = extract_rubric_items(txt)
        for crit, levels in items:
            # normalize to 4 levels
            lv = levels + [('',None,'')]* (4 - len(levels))
            rows.append([title, course_dir.name, '', crit,
                         lv[0][0], lv[0][1] if lv[0][1] is not None else '', lv[0][2],
                         lv[1][0], lv[1][1] if lv[1][1] is not None else '', lv[1][2],
                         lv[2][0], lv[2][1] if lv[2][1] is not None else '', lv[2][2],
                         lv[3][0], lv[3][1] if lv[3][1] is not None else '', lv[3][2]])
    # module-level rubrics
    modules = course_dir / 'modules'
    if not modules.exists():
        modules = course_dir / 'site' / 'modules'
    if modules.exists():
        for mod in sorted([p for p in modules.iterdir() if p.is_dir()]):
            rub = mod / 'rubric.md'
            if not rub.exists():
                continue
            txt = rub.read_text(encoding='utf8')
            title = f'{course_dir.name} - {mod.name}'
            items = extract_rubric_items(txt)
            for crit, levels in items:
                lv = levels + [('',None,'')]* (4 - len(levels))
                rows.append([title, course_dir.name, mod.name, crit,
                             lv[0][0], lv[0][1] if lv[0][1] is not None else '', lv[0][2],
                             lv[1][0], lv[1][1] if lv[1][1] is not None else '', lv[1][2],
                             lv[2][0], lv[2][1] if lv[2][1] is not None else '', lv[2][2],
                             lv[3][0], lv[3][1] if lv[3][1] is not None else '', lv[3][2]])

# write CSV
out.parent.mkdir(exist_ok=True)
with out.open('w', newline='', encoding='utf8') as f:
    w = csv.writer(f)
    w.writerow(['rubric_title','course','module','criterion',
                'level4_name','level4_points','level4_description',
                'level3_name','level3_points','level3_description',
                'level2_name','level2_points','level2_description',
                'level1_name','level1_points','level1_description'])
    w.writerows(rows)

print('WROTE', out, 'rows=', len(rows))
