#!/usr/bin/env python3
import json,csv
from pathlib import Path
src = Path('outputs/completeness_report.json')
out = Path('outputs/completeness_report.csv')
if not src.exists():
    raise SystemExit('Missing inputs/completeness_report.json')
data = json.loads(src.read_text(encoding='utf8'))
rows = []
for course, info in data.items():
    # course-level checks
    if not info.get('syllabus', False):
        rows.append([course,'', 'syllabus', 'syllabus.md or site/syllabus.html', 'missing', ''])
    if not info.get('rubric', False):
        rows.append([course,'', 'course_rubric', 'rubric.md or rubric.yaml', 'missing', ''])
    modules = info.get('modules', {})
    for mod, minfo in modules.items():
        for key in ['overview','learning_objectives','lecture','slides','activities','knowledge_check','rubric']:
            present = minfo.get(key, False)
            if not present:
                expected = ''
                if key=='overview': expected='overview.md/html'
                elif key=='learning_objectives': expected='learning objectives in overview'
                elif key=='lecture': expected='lecture.md/html'
                elif key=='slides': expected='slides.pdf or slides.pptx or slides.html'
                elif key=='activities': expected='activities.md/html'
                elif key=='knowledge_check': expected='knowledge-check.md/html'
                elif key=='rubric': expected='rubric.md/yaml'
                rows.append([course, mod, key, expected, 'missing', ''])
# write CSV
out.parent.mkdir(exist_ok=True)
with out.open('w', newline='', encoding='utf8') as f:
    w = csv.writer(f)
    w.writerow(['course','module','missing_type','expected_file','status','notes'])
    w.writerows(rows)
print('WROTE', out)
