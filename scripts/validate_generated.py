#!/usr/bin/env python3
"""Validate and lightly format generated course markdown/text.

Writes a short spellcheck report if `spellchecker` is installed.
"""
from pathlib import Path
import re
import textwrap
import sys

ROOT = Path(__file__).resolve().parents[1]
COURSES_DIR = ROOT / 'content' / 'courses'


def normalize_text(s: str) -> str:
    # Normalize line endings
    s = s.replace('\r\n', '\n').replace('\r', '\n')
    # Trim trailing whitespace on each line
    s = '\n'.join([ln.rstrip() for ln in s.split('\n')])
    # Ensure at most two consecutive blank lines
    s = re.sub(r"\n{3,}", "\n\n", s)
    # Ensure blank line after headings
    s = re.sub(r"(?m)^(#{1,6} .+)$\n(?!\n)", r"\1\n\n", s)
    return s


def wrap_paragraphs(s: str, width=88) -> str:
    parts = re.split(r"(\n\s*\n)", s)
    out = []
    for p in parts:
        if p.strip() == '':
            out.append(p)
            continue
        if p.startswith('#'):
            out.append(p)
            continue
        # wrap
        out.append(textwrap.fill(p, width=width))
    return ''.join(out)


def find_generated_folders():
    for course in COURSES_DIR.iterdir():
        gen = course / 'generated'
        if gen.exists() and gen.is_dir():
            yield course, gen


def run_spellcheck_on_text(text: str):
    try:
        from spellchecker import SpellChecker
    except Exception:
        return None
    sc = SpellChecker()
    words = re.findall(r"[A-Za-z']{2,}", text)
    miss = sc.unknown([w for w in words])
    # return top 100
    return sorted(list(miss))[:100]


def process_file(path: Path, report_lines: list):
    raw = path.read_text(encoding='utf-8')
    n = normalize_text(raw)
    n = wrap_paragraphs(n)
    if n != raw:
        path.write_text(n, encoding='utf-8')
        report_lines.append(f'Formatted: {path}')
    else:
        report_lines.append(f'OK: {path}')
    # spellcheck
    miss = run_spellcheck_on_text(n)
    if miss is None:
        return
    if miss:
        rpt = (path.parent / 'spellcheck_report.txt')
        with open(rpt, 'a', encoding='utf-8') as f:
            f.write(f'File: {path.name}\n')
            f.write('\n'.join(miss))
            f.write('\n\n')


def main():
    reports = []
    for course, gen in find_generated_folders():
        report_lines = []
        for f in gen.rglob('*'):
            if f.is_file() and f.suffix.lower() in ['.md', '.txt', '.json']:
                process_file(f, report_lines)
        report_file = gen / 'validation_report.txt'
        report_file.write_text('\n'.join(report_lines), encoding='utf-8')
        reports.append(str(report_file))
        print('Validated', course.name, '->', report_file)
    print('Validation complete. Reports:', reports)


if __name__ == '__main__':
    main()
