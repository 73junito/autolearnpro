#!/usr/bin/env python3
"""Create per-course YAML metadata files based on `courses.json`.

This writes a lightweight `course.yaml` per course folder with title, short
description, and slug. `generate_course_site.py` will read these files if present.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COURSES_JSON = ROOT / 'courses.json'
COURSES_DIR = ROOT / 'content' / 'courses'


def load_courses():
    with open(COURSES_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)


def slug(title, cid):
    return f"{cid:02d}-{title.lower().replace(' ', '-').replace('&','and').replace('/','-')}"


def write_yaml(path: Path, data: dict):
    out = []
    for k,v in data.items():
        out.append(f"{k}: {v}")
    path.write_text("\n".join(out), encoding='utf-8')


def main():
    courses = load_courses()
    for c in courses:
        cid = c.get('id')
        title = c.get('title')
        folder = COURSES_DIR / slug(title, cid)
        if not folder.exists():
            continue
        meta = {
            'title': title,
            'short': title + ' — course materials and labs',
            'slug': slug(title, cid)
        }
        write_yaml(folder / 'course.yaml', meta)
        print('Wrote', folder / 'course.yaml')

if __name__ == '__main__':
    main()
