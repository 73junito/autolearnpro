#!/usr/bin/env python3
"""
Generate course page stubs from CSV files.

Usage:
  python scripts/generate_course_pages.py \
    --courses scripts/data/courses.csv \
    --modules scripts/data/modules.csv \
    --lessons scripts/data/lessons.csv \
    --out scripts/docs/course_pages

CSV formats
- courses.csv: slug,code,title,course_id,summary,authors,tags,last_updated,published,estimated_time_minutes,credits,duration_hours,level,prerequisites,learning_objectives
- modules.csv: course_slug,module_slug,title,module_id,summary,sequence_number,duration_weeks,objectives
- lessons.csv: course_slug,module_slug,lesson_slug,title,lesson_id,estimated_time_minutes,lesson_type,content

The script is idempotent and will not overwrite existing files unless --force is provided.
"""
import csv
import argparse
from pathlib import Path
import sys

FRONT_TEMPLATE_COURSE = """---
title: "{title}"
slug: "{slug}"
code: "{code}"
course_id: {course_id}
summary: "{summary}"
authors: {authors}
last_updated: "{last_updated}"
tags: {tags}
published: {published}
estimated_time_minutes: {estimated_time_minutes}
credits: {credits}
duration_hours: {duration_hours}
level: "{level}"
prerequisites: {prerequisites}
learning_objectives: {learning_objectives}
---

# {title}

{summary}

## Modules

{modules_list}
"""

FRONT_TEMPLATE_MODULE = """---
title: "{title}"
slug: "{slug}"
module_id: {module_id}
summary: "{summary}"
sequence_number: {sequence}
duration_weeks: {duration_weeks}
objectives: {objectives}
---

# {title}

### Lessons

{lessons_list}
"""

FRONT_TEMPLATE_LESSON = """---
title: "{title}"
slug: "{slug}"
lesson_id: {lesson_id}
estimated_time_minutes: {estimated_time_minutes}
lesson_type: "{lesson_type}"
---

# {title}

{content}
"""


def parse_csv(path: Path):
    if not path or not path.exists():
        return []
    rows = []
    with path.open(newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({k: (v.strip() if v is not None else '') for k,v in r.items()})
    return rows


def ensure_dir(p: Path):
    if not p.exists():
        p.mkdir(parents=True, exist_ok=True)


def write_if_missing(path: Path, content: str, force=False):
    if path.exists() and not force:
        print(f"Skipping existing: {path}")
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')
    print(f"Written: {path}")
    return True


def as_list_text(s):
    """Convert comma/semicolon separated string into YAML list text."""
    if not s:
        return '[]'
    sep = ';' if ';' in s else ','
    parts = [p.strip() for p in s.split(sep) if p.strip()]
    return '[' + ', '.join(f'"{p}"' for p in parts) + ']'


def as_yaml_block_list(s):
    """Convert comma/semicolon separated string into YAML block list ([- style])
    Returns a Python string representing a YAML list, e.g. [- item1, - item2] or []
    We'll output as a YAML block list format as a Python string that will be written into file.
    For simplicity we return a YAML inline list like ["a","b"] which is acceptable.
    """
    return as_list_text(s)


def main():
    parser = argparse.ArgumentParser(description='Generate course page stubs from CSV')
    parser.add_argument('--courses', type=Path, default=Path('scripts/data/courses.csv'))
    parser.add_argument('--modules', type=Path, default=Path('scripts/data/modules.csv'))
    parser.add_argument('--lessons', type=Path, default=Path('scripts/data/lessons.csv'))
    parser.add_argument('--out', type=Path, default=Path('scripts/docs/course_pages'))
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()

    courses = parse_csv(args.courses)
    modules = parse_csv(args.modules)
    lessons = parse_csv(args.lessons)

    # Index modules & lessons by course/module
    modules_by_course = {}
    for m in modules:
        cslug = m.get('course_slug')
        modules_by_course.setdefault(cslug, []).append(m)

    lessons_by_course_module = {}
    for l in lessons:
        cslug = l.get('course_slug')
        mslug = l.get('module_slug')
        lessons_by_course_module.setdefault((cslug, mslug), []).append(l)

    # Process courses
    for c in courses:
        slug = c.get('slug')
        if not slug:
            print('Skipping course with no slug')
            continue
        out_course = args.out / slug
        ensure_dir(out_course)
        # Build modules list
        module_rows = modules_by_course.get(slug, [])
        modules_list_md = ''
        for mr in sorted(module_rows, key=lambda x: int(x.get('sequence_number') or 0)):
            ms = mr.get('module_slug') or mr.get('slug')
            mtitle = mr.get('title') or ms
            modules_list_md += f"- [{mtitle}](modules/{ms}.md)\n"

        authors_text = as_list_text(c.get('authors') or '')
        tags = as_list_text(c.get('tags') or '')
        prerequisites = as_list_text(c.get('prerequisites') or '')
        learning_objectives = as_yaml_block_list(c.get('learning_objectives') or '')

        content = FRONT_TEMPLATE_COURSE.format(
            title=c.get('title') or slug,
            slug=slug,
            code=c.get('code') or '',
            course_id=c.get('course_id') or 0,
            summary=c.get('summary',''),
            authors=authors_text,
            last_updated=c.get('last_updated') or '',
            tags=tags,
            published=(c.get('published') or 'false'),
            estimated_time_minutes=c.get('estimated_time_minutes') or 0,
            credits=c.get('credits') or 0,
            duration_hours=c.get('duration_hours') or 0,
            level=c.get('level') or '',
            prerequisites=prerequisites,
            learning_objectives=learning_objectives,
            modules_list=modules_list_md
        )
        write_if_missing(out_course / 'index.md', content, force=args.force)

        # Create modules
        for mr in module_rows:
            mslug = mr.get('module_slug')
            if not mslug:
                continue
            out_module = out_course / 'modules' / f"{mslug}.md"
            # Build lessons list
            lesson_rows = lessons_by_course_module.get((slug, mslug), [])
            lessons_md = ''
            for lr in sorted(lesson_rows, key=lambda x: int(x.get('lesson_id') or 0)):
                lslug = lr.get('lesson_slug')
                ltitle = lr.get('title') or lslug
                lessons_md += f"- [{ltitle}](../lessons/{lslug}.md)\n"
            objectives = as_list_text(mr.get('objectives') or '')
            module_content = FRONT_TEMPLATE_MODULE.format(
                title=mr.get('title') or mslug,
                slug=mslug,
                module_id=mr.get('module_id') or 0,
                summary=mr.get('summary') or '',
                sequence=mr.get('sequence_number') or 0,
                duration_weeks=mr.get('duration_weeks') or 0,
                objectives=objectives,
                lessons_list=lessons_md
            )
            write_if_missing(out_module, module_content, force=args.force)

        # Create lessons
        for key, lrows in lessons_by_course_module.items():
            cslug, mslug = key
            if cslug != slug:
                continue
            for lr in lrows:
                lslug = lr.get('lesson_slug')
                if not lslug:
                    continue
                out_lesson = out_course / 'lessons' / f"{lslug}.md"
                content_text = lr.get('content') or 'Content goes here.'
                lesson_content = FRONT_TEMPLATE_LESSON.format(
                    title=lr.get('title') or lslug,
                    slug=lslug,
                    lesson_id=lr.get('lesson_id') or 0,
                    estimated_time_minutes=lr.get('estimated_time_minutes') or 0,
                    lesson_type=lr.get('lesson_type') or 'lesson',
                    content=content_text
                )
                write_if_missing(out_lesson, lesson_content, force=args.force)

    print('Generation complete.')

if __name__ == '__main__':
    main()
