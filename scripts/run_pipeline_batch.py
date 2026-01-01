#!/usr/bin/env python3
"""Run the 3-stage Ollama pipeline across lecture stubs.

This script searches `content/courses/*/lectures/week-*.md`, skips stubs
already containing an AUTO-GENERATED marker, and for each remaining stub:
 - runs `scripts/ollama_pipeline.py --topic "<course> <week>"`
 - moves the pipeline outputs into `outputs/ollama_pipeline/<course>/<week>/`
 - applies the `03_polished.txt` into the stub using `apply_pipeline_results.py`

The script logs results to `outputs/ollama_pipeline/batch_log.csv`.
"""
import os
import sys
import subprocess
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'content' / 'courses'
OUT = ROOT / 'outputs' / 'ollama_pipeline'
OUT.mkdir(parents=True, exist_ok=True)
LOG = OUT / 'batch_log.csv'

def is_already_generated(path: Path) -> bool:
    try:
        text = path.read_text(encoding='utf-8')
        return 'AUTO-GENERATED: Polished by ollama_pipeline.py' in text
    except Exception:
        return False

def run_pipeline_for_stub(stub: Path, course_slug: str, week_name: str) -> (bool,str):
    """Run pipeline and apply polished output. Returns (success, message)."""
    env = os.environ.copy()
    # prefer the local ollama serve at 11434 which we've been using
    env['OLLAMA_HOST'] = env.get('OLLAMA_HOST','http://127.0.0.1:11434')

    topic = f"{course_slug.replace('-', ' ')} {week_name}"
    print(f'Running pipeline for: {stub}  topic="{topic}"')
    try:
        p = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'ollama_pipeline.py'), '--topic', topic], env=env, capture_output=True, text=True)
        if p.returncode != 0:
            return False, f'pipeline rc={p.returncode} stderr={p.stderr.strip()[:200]}'
        # create per-stub folder and move outputs
        dest = OUT / course_slug / week_name
        dest.mkdir(parents=True, exist_ok=True)
        # move all files in OUT (01_.. 02_.. 03_..) into dest
        for f in (OUT).glob('0*_*.txt'):
            try:
                f.rename(dest / f.name)
            except Exception:
                # if file already exists, overwrite
                content = f.read_text(encoding='utf-8')
                (dest / f.name).write_text(content, encoding='utf-8')
                f.unlink()

        polished = dest / '03_polished.txt'
        if not polished.exists():
            return False, 'polished output missing'

        # apply polished into the stub
        apply_cmd = [sys.executable, str(ROOT / 'scripts' / 'apply_pipeline_results.py'), '--src', str(polished), '--dst', str(stub)]
        q = subprocess.run(apply_cmd, capture_output=True, text=True)
        if q.returncode != 0:
            return False, f'apply rc={q.returncode} stderr={q.stderr.strip()[:200]}'
        return True, 'ok'
    except Exception as e:
        return False, f'exception: {e}'

def find_stubs():
    for course in sorted(CONTENT.iterdir()):
        lectures_dir = course / 'lectures'
        if not lectures_dir.exists():
            continue
        for stub in sorted(lectures_dir.glob('week-*-lecture.md')):
            yield course.name, stub

def main():
    rows = []
    for course_slug, stub in find_stubs():
        week_name = stub.stem  # e.g. week-01-lecture
        if is_already_generated(stub):
            print(f'SKIP (already generated): {stub}')
            rows.append([course_slug, str(stub), 'skipped', 'already_generated'])
            continue
        success, msg = run_pipeline_for_stub(stub, course_slug, week_name)
        print(f'--> {course_slug}/{week_name}: {success} {msg}')
        rows.append([course_slug, str(stub), 'ok' if success else 'fail', msg.replace('\n',' ')])
        # flush log every iteration
        with open(LOG, 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(['course','stub','status','msg'])
            w.writerows(rows)

    print('\nBatch run complete. Log at', LOG)

if __name__ == '__main__':
    main()
