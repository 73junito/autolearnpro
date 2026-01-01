#!/usr/bin/env python3
from pathlib import Path
import re

root = Path('content/courses')
created = []
updated = []
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
            text = rubric_f.read_text(encoding='utf8')
        except Exception:
            text = ''
        if 'DRAFT' not in text and 'Status: DRAFT' not in text:
            # skip non-placeholder rubrics
            continue
        # find learning objectives in overview.*
        objectives = []
        for cand in mod_dir.glob('overview.*'):
            try:
                t = cand.read_text(encoding='utf8')
            except Exception:
                continue
            # simple parse: lines after '## Learning Objectives' or '- ' bullets
            m = re.search(r'##\s*Learning Objectives\s*(.*?)\n\n', t, re.I|re.S)
            if m:
                block = m.group(1)
                # get bullets
                bullets = re.findall(r'^[\-\*]\s*(.+)$', block, re.M)
                objectives.extend(bullets)
            # fallback: look for lines starting with '- ' anywhere
            if not objectives:
                bullets = re.findall(r'^\-\s*(.+)$', t, re.M)
                if bullets:
                    objectives.extend(bullets[:3])
        # choose up to 3 criteria from objectives
        if objectives:
            criteria = [o.strip() for o in objectives[:3]]
        else:
            criteria = ['Understanding of core concepts', 'Correct application of procedures', 'Safety and professionalism']
        # build rubric content (3 criteria x 4 levels)
        levels = ['Exceeds expectations (4)', 'Meets expectations (3)', 'Approaching (2)', 'Needs improvement (1)']
        descriptors = {
            'Understanding of core concepts': [
                'Demonstrates deep conceptual understanding and connects ideas.',
                'Explains concepts accurately with clear examples.',
                'Explains some concepts but misses minor points.',
                'Shows limited or incorrect understanding.'
            ],
            'Correct application of procedures': [
                'Performs procedures expertly with flawless execution.',
                'Performs procedures correctly with minor errors.',
                'Performs procedures with several errors; partial success.',
                'Fails to perform procedures or major errors present.'
            ],
            'Safety and professionalism': [
                'Always follows safety protocols and demonstrates leadership.',
                'Follows safety protocols consistently.',
                'Occasionally misses safety steps; needs reminders.',
                'Neglects safety and professional conduct.'
            ]
        }
        # for custom objectives not in descriptors, create generic descriptors
        content_lines = [f'# Rubric — DRAFT (Auto-generated)\n', f'*Course: {course_dir.name}*\n*Module: {mod_dir.name}*\n\n']
        content_lines.append('## Rubric Overview\n')
        content_lines.append('This rubric is an auto-generated draft. Revise criteria and descriptors to match the module activities and assessment evidence.\n\n')
        for crit in criteria:
            content_lines.append(f'### {crit}\n')
            if crit in descriptors:
                descs = descriptors[crit]
            else:
                # generic descriptors
                descs = [
                    f'Advanced performance demonstrating exceptional {crit.lower()}.',
                    f'Competent performance meeting expected {crit.lower()}.',
                    f'Partial performance showing basic {crit.lower()}.',
                    f'Insufficient performance for {crit.lower()}.'
                ]
            content_lines.append('| Level | Description |\n|---|---|')
            for lv, d in zip(levels, descs):
                content_lines.append(f'| {lv} | {d} |')
            content_lines.append('\n')
        content = '\n'.join(content_lines)
        rubric_f.write_text(content, encoding='utf8')
        updated.append(str(rubric_f))

# write report
out = Path('outputs/rubrics_drafted.txt')
out.parent.mkdir(exist_ok=True)
out.write_text('\n'.join(updated), encoding='utf8')
print('WROTE', out, 'count=', len(updated))
