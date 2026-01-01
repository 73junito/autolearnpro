#!/usr/bin/env python3
import os, json
from pathlib import Path
root = Path('content/courses')
report = {}
for course_dir in sorted(root.iterdir() if root.exists() else []):
    if not course_dir.is_dir():
        continue
    course = course_dir.name
    course_report = { 'syllabus': False, 'rubric': False, 'modules': {} }
    # syllabus
    if (course_dir / 'syllabus.md').exists() or (course_dir / 'site' / 'syllabus.html').exists():
        course_report['syllabus'] = True
    # rubric at course level
    if (course_dir / 'rubric.md').exists() or (course_dir / 'rubric.yaml').exists():
        course_report['rubric'] = True
    modules_root = course_dir / 'modules'
    if not modules_root.exists():
        # also check site/modules
        modules_root = course_dir / 'site' / 'modules'
    if not modules_root.exists():
        report[course] = course_report
        continue
    for m in sorted(modules_root.iterdir()):
        if not m.is_dir():
            continue
        mod = m.name
        files = {p.name.lower(): p for p in m.glob('*')}
        # candidate presence checks
        overview = any(name.startswith('overview') for name in files)
        lecture = any(name.startswith('lecture') for name in files)
        activities = any('activity' in name for name in files)
        knowledge = any('knowledge' in name or 'selfcheck' in name for name in files)
        slides = any(name.startswith('slides') or name.endswith('.pptx') or name.endswith('.pdf') for name in files)
        rubric = any('rubric' in name for name in files)
        # check Learning Objectives in overview file content
        learning_objectives = False
        for cand in m.glob('overview.*'):
            try:
                text = cand.read_text(encoding='utf8')
                if 'learning objective' in text.lower() or 'learning objectives' in text.lower() or '## learning objectives' in text.lower():
                    learning_objectives = True
                    break
            except Exception:
                pass
        course_report['modules'][mod] = {
            'overview': overview,
            'learning_objectives': learning_objectives,
            'lecture': lecture,
            'slides': slides,
            'activities': activities,
            'knowledge_check': knowledge,
            'rubric': rubric,
        }
    report[course] = course_report
outdir = Path('outputs')
outdir.mkdir(exist_ok=True)
with open(outdir / 'completeness_report.json','w',encoding='utf8') as f:
    json.dump(report,f,indent=2)
print('WROTE outputs/completeness_report.json')
