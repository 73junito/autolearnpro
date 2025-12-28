#!/usr/bin/env python3
"""Find common misspellings across generated content and apply conservative fixes.

This script reads all `generated/spellcheck_report.txt` files, identifies words
that appear misspelled in multiple files, and applies the top suggested correction
to all generated markdown/text files. Backups are created with .bak extension.
"""
from pathlib import Path
from collections import Counter, defaultdict
import re

ROOT = Path(__file__).resolve().parents[1]
COURSES_DIR = ROOT / 'content' / 'courses'


def collect_misspellings():
    counts = Counter()
    locations = defaultdict(list)
    for course in COURSES_DIR.iterdir():
        rpt = course / 'generated' / 'spellcheck_report.txt'
        if not rpt.exists():
            continue
        text = rpt.read_text(encoding='utf-8')
        for w in re.findall(r"[A-Za-z']{2,}", text):
            lw = w.strip()
            counts[lw] += 1
            locations[lw].append(str(rpt))
    return counts, locations


def suggest_corrections(words):
    try:
        from spellchecker import SpellChecker
    except Exception:
        return {}
    sc = SpellChecker()
    corrections = {}
    for w in words:
        corr = sc.correction(w)
        if corr and corr.lower() != w.lower():
            corrections[w] = corr
    return corrections


def apply_replacements(corrections, threshold=3):
    # apply to generated text files
    replaced_total = 0
    for course in COURSES_DIR.iterdir():
        gen = course / 'generated'
        if not gen.exists():
            continue
        for f in gen.rglob('*'):
            if not f.is_file() or f.suffix.lower() not in ['.md', '.txt', '.json']:
                continue
            s = f.read_text(encoding='utf-8')
            orig = s
            for w, corr in corrections.items():
                # conservative replacement: whole-word, case-preserving
                pattern = re.compile(rf"\b{re.escape(w)}\b", flags=re.IGNORECASE)
                def repl(m):
                    matched = m.group(0)
                    # preserve capitalization
                    if matched.isupper():
                        return corr.upper()
                    if matched[0].isupper():
                        return corr.capitalize()
                    return corr
                s = pattern.sub(repl, s)
            if s != orig:
                bak = f.with_suffix(f"{f.suffix}.bak")
                if not bak.exists():
                    f.rename(bak)
                    bak.write_text(orig, encoding='utf-8')
                    # write new content to original path
                    f.write_text(s, encoding='utf-8')
                else:
                    # just overwrite
                    f.write_text(s, encoding='utf-8')
                replaced_total += 1
    return replaced_total


def main():
    counts, locations = collect_misspellings()
    # pick words that appear in at least 3 reports
    common = [w for w,c in counts.items() if c >= 3]
    if not common:
        print('No common misspellings found (threshold=3).')
        return
    print('Common misspellings:', common[:50])
    corrections = suggest_corrections(common)
    print('Proposed corrections:', corrections)
    if not corrections:
        print('No corrections suggested by spellchecker.')
        return
    applied = apply_replacements(corrections)
    print('Applied replacements to', applied, 'files')


if __name__ == '__main__':
    main()
