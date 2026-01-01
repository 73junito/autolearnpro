#!/usr/bin/env python3
"""Generate simple static HTML pages for courses from markdown files.

Uses `markdown` module if available; otherwise falls back to minimal conversion.
"""
from pathlib import Path
import sys
import re

ROOT = Path(__file__).resolve().parents[1]
COURSES_DIR = ROOT / 'content' / 'courses'
THEME_DIR = ROOT / 'theme' / 'student-dashboard'


def safe_markdown(text: str) -> str:
    try:
        import markdown
        return markdown.markdown(text)
    except Exception:
        # very simple fallback
        html = []
        paragraph = []
        def flush_para():
            nonlocal paragraph
            if paragraph:
                html.append('<p>' + ' '.join(paragraph) + '</p>')
                paragraph = []
        for line in text.splitlines():
            if line.startswith('# '):
                flush_para()
                html.append(f'<h1>{line[2:].strip()}</h1>')
            elif line.startswith('## '):
                flush_para()
                html.append(f'<h2>{line[3:].strip()}</h2>')
            elif line.strip() == '':
                flush_para()
            else:
                paragraph.append(line.strip())
        flush_para()
        return '\n'.join(html)


def read_course_metadata(course_folder: Path) -> dict:
    # read simple key: value pairs from course.yaml if present
    meta = {}
    path = course_folder / 'course.yaml'
    if not path.exists():
        return meta
    for line in path.read_text(encoding='utf-8').splitlines():
        if ':' in line:
            k,v = line.split(':',1)
            meta[k.strip()] = v.strip()
    return meta


def write_page(path: Path, title: str, body: str):
        css_link = Path('../../theme/student-dashboard/style.css')
        html = f'''<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>{title}</title>
    <link rel="stylesheet" href="{css_link.as_posix()}">
</head>
<body>
<div class="sd-app">
    <aside class="sd-side"><div class="sd-side-inner">{generate_sidebar_links(path.parent)}</div></aside>
    <div class="sd-content">
        <header class="sd-header"><h1>{title}</h1></header>
        <main class="sd-main">{body}</main>
    </div>
</div>
</body>
</html>'''
        path.write_text(html, encoding='utf-8')


def generate_course_site(course_folder: Path):
    site_dir = course_folder / 'site'
    site_dir.mkdir(parents=True, exist_ok=True)
    # index page
    title = course_folder.name
    links = []
    # collect markdown files (lessons, generated, syllabus, README)
    mdfiles = [p for p in sorted(course_folder.rglob('*.md')) if 'site' not in p.parts]
    for mdfile in mdfiles:
        rel = mdfile.relative_to(course_folder)
        outname = (site_dir / rel).with_suffix('.html')
        outname.parent.mkdir(parents=True, exist_ok=True)
        body = safe_markdown(mdfile.read_text(encoding='utf-8'))
        # add metadata header
        stat = mdfile.stat()
        meta_html = f'<div class="meta">File: {rel.as_posix()} — {stat.st_size} bytes</div>'
        write_page(outname, f"{course_folder.name} — {mdfile.name}", meta_html + body)
        links.append((rel.as_posix(), outname.relative_to(site_dir)))
    # index with sidebar links
    list_items = '\n'.join([f'<li><a href="{p.as_posix()}">{n}</a></li>' for n,p in links])
    write_page(site_dir / 'index.html', f'{course_folder.name} — Course Site', f'<h2>Contents</h2><ul>{list_items}</ul>')
    print('Generated site for', course_folder.name)


def generate_sidebar_links(site_parent: Path) -> str:
    # build a simple sidebar listing site/*.html at same course level
    course_root = site_parent.parent
    site_dir = course_root / 'site'
    if not site_dir.exists():
        return ''
    items = []
    for f in sorted(site_dir.rglob('*.html')):
        rel = f.relative_to(site_dir)
        # prefer index
        items.append(f'<div class="sd-link"><a href="{rel.as_posix()}">{rel.as_posix()}</a></div>')
    return '\n'.join(items)


def main():
    for course in COURSES_DIR.iterdir():
        if course.is_dir():
            # read metadata if available and pass into generator
            meta = read_course_metadata(course)
            generate_course_site(course)


if __name__ == '__main__':
    main()
