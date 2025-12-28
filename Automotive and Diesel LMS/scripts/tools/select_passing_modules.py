#!/usr/bin/env python3
"""Select modules whose generated lessons pass automated QA thresholds.

Pass criteria (configurable here):
- audio_word_count >= 90
- visual_diagrams >= 1
- numbered_steps >= 6

Outputs JSON with list of passing module paths (course/module).
"""
import json
from pathlib import Path


THRESHOLDS = {
    'audio_word_count': 90,
    'visual_diagrams': 1,
    'numbered_steps': 6,
}


def analyze_file(p: Path):
    try:
        js = json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        return None
    ws = js.get('written_steps', '')
    # numbered steps heuristic: count lines starting with digit+
    num_steps = sum(1 for l in str(ws).splitlines() if l.strip() and l.strip()[0].isdigit())
    visuals = len(js.get('visual_diagrams', []) or [])
    audio_words = len(str(js.get('audio_script', '')).split())
    return {
        'file': str(p),
        'numbered_steps': num_steps,
        'visual_diagrams': visuals,
        'audio_word_count': audio_words,
    }


def main():
    base = Path('scripts/data/multimodal')
    passing = set()
    for p in base.rglob('*.json'):
        data = analyze_file(p)
        if not data:
            continue
        ok = True
        for k, v in THRESHOLDS.items():
            if data.get(k, 0) < v:
                ok = False
                break
        if ok:
            # derive module path: scripts/data/multimodal/<course>/<module>/file.json
            parts = p.parts
            # find 'multimodal' index
            try:
                idx = parts.index('multimodal')
                course = parts[idx+1]
                module = parts[idx+2]
                passing.add((course, module))
            except Exception:
                continue

    out = {
        'thresholds': THRESHOLDS,
        'passing_modules': sorted([{'course': c, 'module': m} for c, m in passing]),
    }
    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()
