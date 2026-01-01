#!/usr/bin/env python3
"""Create lecture markdown stubs for each course lacking robust weekly lectures.

Creates files under: content/courses/<course_slug>/lectures/week-01-lecture.md
Default: 10 weeks per course. Use --weeks to change.

Each stub contains sections: Learning Objectives, Lecture Notes, Readings, Activities, Estimated Time.
"""
from pathlib import Path
import argparse

ROOT = Path('.').resolve()
COURSES_DIR = ROOT / 'content' / 'courses'

TEMPLATE = """
# Week {week_num}: {week_title}

## Learning Objectives

- Objective 1: ...
- Objective 2: ...

## Lecture Notes

Write robust lecture content here. Include explanations, diagrams, and worked examples.

## Readings / Resources

- Required: ...
- Supplementary: ...

## In-class Activities / Demonstrations

- Activity 1: ...

## Assessments / Assignments

- Assignment: ...

## Estimated Time

- Lecture: 45 min
- Activity: 30 min

"""

def find_courses():
    if not COURSES_DIR.exists():
        return []
    return [p for p in sorted(COURSES_DIR.iterdir()) if p.is_dir()]

def ensure_lectures_dir(course_dir: Path):
    lec_dir = course_dir / 'lectures'
    lec_dir.mkdir(parents=True, exist_ok=True)
    return lec_dir

def write_stub(lec_dir: Path, week: int):
    name = f"week-{week:02d}-lecture.md"
    path = lec_dir / name
    if path.exists():
        return False
    content = TEMPLATE.format(week_num=week, week_title=f'Week {week}')
    path.write_text(content, encoding='utf-8')
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--weeks', type=int, default=10, help='Number of weeks to create per course')
    parser.add_argument('--force', action='store_true', help='Overwrite existing stubs')
    args = parser.parse_args()

    courses = find_courses()
    created = 0
    for c in courses:
        lec = ensure_lectures_dir(c)
        for w in range(1, args.weeks + 1):
            name = f"week-{w:02d}-lecture.md"
            path = lec / name
            if path.exists() and not args.force:
                continue
            content = TEMPLATE.format(week_num=w, week_title=f'Week {w}')
            path.write_text(content, encoding='utf-8')
            created += 1

    print(f'Created {created} lecture stubs across {len(courses)} courses (weeks={args.weeks}).')

if __name__ == '__main__':
    main()
