#!/usr/bin/env python3
"""Generate per-course ratings based on existing outputs.

Checks used (in order of priority):
- outputs/completeness_report.csv (if present)
- presence of outputs/canvas_by_course/<course>.csv
- existence of content/courses/<course>/site/index.html
- whether a backup exists in outputs/index_backups/

Outputs `outputs/course_ratings.csv` with columns: course_id,course_slug,rating,notes

Rating categories:
- complete: ready for instructor review + Canvas CSV present
- mostly-ready: index standardized + placeholders/rubrics present
- scaffolded: index exists but content incomplete
- missing: minimal or no content
"""
from pathlib import Path
import csv
import sys

ROOT = Path('.').resolve()
OUT = ROOT / 'outputs'
OUT.mkdir(exist_ok=True)

COMP_CSV = OUT / 'completeness_report.csv'
CANVAS_DIR = OUT / 'canvas_by_course'
INDEX_BACKUPS = OUT / 'index_backups'

COURSES_DIR = ROOT / 'content' / 'courses'

def load_completeness():
    data = {}
    if COMP_CSV.exists():
        with COMP_CSV.open(encoding='utf-8', newline='') as fh:
            reader = csv.DictReader(fh)
            for r in reader:
                # expects fields course_slug, completeness_score or similar
                slug = r.get('course_slug') or r.get('slug') or r.get('course')
                if not slug:
                    continue
                data[slug] = r
    return data

def detect_courses():
    if not COURSES_DIR.exists():
        return []
    items = []
    for p in sorted(COURSES_DIR.iterdir()):
        if p.is_dir():
            items.append(p.name)
    return items

def has_canvas(slug):
    f = CANVAS_DIR / f"{slug}.csv"
    # some exports may be named differently; check any file starting with slug
    if f.exists():
        return True
    if CANVAS_DIR.exists():
        for c in CANVAS_DIR.iterdir():
            if c.is_file() and c.name.startswith(slug):
                return True
    return False

def index_standardized(slug):
    idx = COURSES_DIR / slug / 'site' / 'index.html'
    if not idx.exists():
        return False
    # heuristic: presence of nav-root id or 'course-hero' string
    txt = idx.read_text(encoding='utf-8', errors='ignore')
    if 'id="nav-root"' in txt or 'course-hero' in txt or 'Contents' in txt:
        return True
    return False

def has_backup(slug):
    if not INDEX_BACKUPS.exists():
        return False
    for f in INDEX_BACKUPS.iterdir():
        if f.is_file() and slug in f.name:
            return True
    return False

def rate_course(slug, comp_data):
    notes = []
    comp = comp_data.get(slug)
    canvas = has_canvas(slug)
    idx = index_standardized(slug)
    backup = has_backup(slug)

    # Simple rules
    if canvas and idx:
        rating = 'complete'
        if comp:
            notes.append('has completeness entry')
    elif idx and (canvas or comp):
        rating = 'mostly-ready'
        if not canvas:
            notes.append('missing canvas CSV')
    elif idx:
        rating = 'scaffolded'
        notes.append('index exists but content likely incomplete')
    else:
        rating = 'missing'
        if backup:
            notes.append('original index backup exists')

    return rating, '; '.join(notes)

def main():
    comp = load_completeness()
    courses = detect_courses()
    out_file = OUT / 'course_ratings.csv'
    with out_file.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.writer(fh)
        writer.writerow(['course_slug', 'rating', 'notes'])
        for slug in courses:
            rating, notes = rate_course(slug, comp)
            writer.writerow([slug, rating, notes])

    print('Wrote ratings to', out_file)

if __name__ == '__main__':
    main()
