#!/usr/bin/env python3
from pathlib import Path

root = Path('content/courses')
created = []
for course_dir in sorted(root.iterdir() if root.exists() else []):
    if not course_dir.is_dir():
        continue
    # skip if course-level rubric exists
    rubric_file = course_dir / 'rubric.md'
    if rubric_file.exists():
        continue
    # read syllabus title if present
    title = course_dir.name
    sy = course_dir / 'syllabus.md'
    if not sy.exists():
        sy = course_dir / 'site' / 'syllabus.html'
    if sy.exists():
        try:
            tt = sy.read_text(encoding='utf8')
            # pick first heading or filename
            import re
            m = re.search(r'^#\s*(.+)$', tt, re.M)
            if m:
                title = m.group(1).strip()
        except Exception:
            pass
    # build rubric content (4 criteria x 4 levels)
    content = f"""# Course Rubric — DRAFT

*Course: {course_dir.name}*

This course-level rubric is auto-generated to provide consistent grading criteria across modules. Adapt criteria and weights for instructor-led assessments.

## Rubric Structure
The rubric below uses four core criteria with four performance levels. Update as needed.

### 1) Conceptual Understanding
| Level | Description |
|---|---|
| Exemplary (4) | Demonstrates thorough, accurate, and insightful understanding of key course concepts. |
| Proficient (3) | Demonstrates solid understanding with minor omissions. |
| Developing (2) | Shows basic understanding but with notable gaps. |
| Beginning (1) | Limited or incorrect understanding of major concepts. |

### 2) Procedural Skill & Accuracy
| Level | Description |
|---|---|
| Exemplary (4) | Performs procedures accurately and efficiently with professional technique. |
| Proficient (3) | Performs procedures correctly with minor errors. |
| Developing (2) | Performs procedures with errors; requires guidance. |
| Beginning (1) | Fails to perform required procedures correctly. |

### 3) Application & Problem Solving
| Level | Description |
|---|---|
| Exemplary (4) | Applies concepts to solve complex, real-world problems effectively. |
| Proficient (3) | Applies concepts to routine problems with success. |
| Developing (2) | Attempts application but with limited success. |
| Beginning (1) | Unable to apply concepts to solve problems. |

### 4) Safety & Professionalism
| Level | Description |
|---|---|
| Exemplary (4) | Consistently models safe, professional, and ethical behavior. |
| Proficient (3) | Generally follows safety and professional norms. |
| Developing (2) | Occasionally neglects safety or professionalism. |
| Beginning (1) | Regularly disregards safety or professional standards. |

*Status: DRAFT — review required by course instructor.*
"""
    try:
        rubric_file.write_text(content, encoding='utf8')
        created.append(str(rubric_file))
    except Exception:
        pass
# write manifest
out = Path('outputs/course_rubrics_created.txt')
out.parent.mkdir(exist_ok=True)
out.write_text('\n'.join(created), encoding='utf8')
print('WROTE', out, 'count=', len(created))
