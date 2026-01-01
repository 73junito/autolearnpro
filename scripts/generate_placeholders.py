#!/usr/bin/env python3
import json
from pathlib import Path
src = Path('outputs/completeness_report.json')
created = []
if not src.exists():
    raise SystemExit('Missing outputs/completeness_report.json')
data = json.loads(src.read_text(encoding='utf8'))
for course, info in data.items():
    # try modules under content/courses/<course>/modules or site/modules
    base = Path('content/courses')/course
    modules_root = base/'modules'
    if not modules_root.exists():
        modules_root = base/'site'/'modules'
    for mod, minfo in info.get('modules', {}).items():
        mod_dir = modules_root/mod
        if not mod_dir.exists():
            # skip if module folder missing
            continue
        # activities
        if not minfo.get('activities', False):
            f = mod_dir/'activities.md'
            if not f.exists():
                f.write_text('# Activities\n\nDRAFT: Instructor to add hands-on activities for this module.\n\n## Suggested Activities\n- Safety briefing\n- Guided lab: step-by-step\n- Group discussion prompts\n\n*Status: DRAFT — review required.*\n', encoding='utf8')
                created.append(str(f))
        # rubric
        if not minfo.get('rubric', False):
            f = mod_dir/'rubric.md'
            if not f.exists():
                f.write_text('# Rubric (DRAFT)\n\nThis is a placeholder rubric. Replace with criteria tied to module competencies.\n\n## Criteria\n- Mastery of core concepts — 4 levels\n- Correctness of procedures — 4 levels\n- Safety and professionalism — 4 levels\n\n*Status: DRAFT — adapt to assessment specifics.*\n', encoding='utf8')
                created.append(str(f))
# Write manifest
out = Path('outputs/placeholders_created.txt')
out.write_text('\n'.join(created), encoding='utf8')
print('WROTE', out, 'files_count=', len(created))
