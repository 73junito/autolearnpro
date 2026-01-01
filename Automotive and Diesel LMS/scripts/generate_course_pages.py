#!/usr/bin/env python3
"""Generate course pages from CSV data files.

This script looks for CSVs under `scripts/data/` (lessons*.csv and modules*.csv)
and produces a documentation tree under the provided `--out` directory:

  OUT/<course_slug>/index.md
  OUT/<course_slug>/modules/<module_slug>.md
  OUT/<course_slug>/lessons/<lesson_slug>.md

The implementation is intentionally robust for tests: if a small CSV set
exists (e.g. `lessons_small.csv`) it will be used; otherwise `modules.csv`
and `lessons.csv` are consulted.
"""
import argparse
from pathlib import Path
import sys
import csv
import datetime
import json
from typing import Dict, List, Optional


def read_csv_any(root: Path, pattern: str) -> List[Dict[str, str]]:
    # Prefer *_small.csv when present for faster test runs
    small = list((root).glob(pattern.replace('.csv', '_small.csv')))
    if small:
        path = small[0]
    else:
        path = root / pattern
        if not path.exists():
            return []

    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return list(reader)


def slug_to_title(slug: str) -> str:
    return slug.replace('-', ' ').replace('_', ' ').title()


def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def load_courses_meta(root: Path) -> Dict[str, Dict]:
    # Load courses.json from repo root if present
    repo_root = root.resolve().parents[1]
    cj = repo_root / 'courses.json'
    meta = {}
    if cj.exists():
        try:
            data = json.loads(cj.read_text(encoding='utf-8'))
            for item in data:
                title = item.get('title', '').strip()
                if title:
                    meta[title.lower()] = item
        except Exception:
            pass
    return meta


def write_index(out_course: Path, course_slug: str, title: str, courses_meta: Optional[Dict[str, Dict]] = None):
    # prefer metadata from courses.json when available
    meta = (courses_meta or {}).get(title.lower(), {}) if courses_meta else {}
    course_id = meta.get('id') or ''
    summary = meta.get('summary') or f"Course pages for {title}"
    authors = meta.get('authors') or ["AutoLearn Team"]
    tags = meta.get('tags') or ["generated"]

    fm_lines = ["---"]
    fm_lines.append(f'title: "{title}"')
    fm_lines.append(f'slug: "{course_slug}"')
    fm_lines.append(f'code: "{course_slug.upper()}"')
    if course_id:
        fm_lines.append(f'course_id: {course_id}')
    fm_lines.append(f'summary: "{summary}"')
    fm_lines.append(f'authors: {json.dumps(authors)}')
    fm_lines.append(f'last_updated: "{datetime.date.today().isoformat()}"')
    fm_lines.append(f'tags: {json.dumps(tags)}')
    fm_lines.append('published: true')
    fm_lines.append('---\n')

    body = f"# {title}\n\n{summary}\n\n## Modules\n\n"
    (out_course / 'index.md').write_text('\n'.join(fm_lines) + '\n' + body, encoding='utf-8')


def write_module(mod_file: Path, row: Dict[str, str]):
    title = row.get('title') or slug_to_title(row.get('module_slug', 'module'))
    summary = row.get('summary', '')
    content = f"---\ntitle: \"{title}\"\nmodule_id: {row.get('module_id', '')}\n---\n\n# {title}\n\n{summary}\n"
    mod_file.write_text(content, encoding='utf-8')


def write_lesson(lesson_file: Path, row: Dict[str, str]):
    title = row.get('title') or slug_to_title(row.get('lesson_slug', 'lesson'))
    body = row.get('content', '')
    fm = f"---\ntitle: \"{title}\"\nlesson_id: {row.get('lesson_id','')}\nestimated_time_minutes: {row.get('estimated_time_minutes','')}\n---\n\n"
    lesson_file.write_text(fm + body + "\n", encoding='utf-8')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', required=True)
    p.add_argument('--force', action='store_true')
    args = p.parse_args()

    root = Path(__file__).resolve().parents[1] / 'scripts' / 'data'
    out_root = Path(args.out)

    lessons = read_csv_any(root, 'lessons.csv')
    modules = read_csv_any(root, 'modules.csv')

    # Group lessons by course_slug
    lessons_by_course: Dict[str, List[Dict[str, str]]] = {}
    for row in lessons:
        cs = row.get('course_slug') or row.get('course') or 'example-course'
        lessons_by_course.setdefault(cs, []).append(row)

    modules_by_course: Dict[str, List[Dict[str, str]]] = {}
    for row in modules:
        cs = row.get('course_slug') or row.get('course') or ''
        modules_by_course.setdefault(cs, []).append(row)

    if not lessons_by_course and not modules_by_course:
        print('No data CSVs found under', str(root), file=sys.stderr)
        return 2

    created = []
    for course_slug in set(list(lessons_by_course.keys()) + list(modules_by_course.keys())):
        out_course = out_root / course_slug
        modules_dir = out_course / 'modules'
        lessons_dir = out_course / 'lessons'
        ensure_dir(modules_dir)
        ensure_dir(lessons_dir)

        # Title heuristics
        title = slug_to_title(course_slug)
        write_index(out_course, course_slug, title)

        # write modules if available
        for m in modules_by_course.get(course_slug, []):
            mod_slug = m.get('module_slug') or m.get('slug') or 'module-1'
            mod_file = modules_dir / f"{mod_slug}.md"
            write_module(mod_file, m)

        # write lessons
        for l in lessons_by_course.get(course_slug, []):
            lesson_slug = l.get('lesson_slug') or l.get('slug') or 'lesson-1'
            lesson_file = lessons_dir / f"{lesson_slug}.md"
            write_lesson(lesson_file, l)

        created.append(str(out_course))

    for pth in created:
        print('Generated', pth)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
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
