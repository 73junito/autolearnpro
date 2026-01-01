#!/usr/bin/env python3
"""Run `generate_multimodal_content.py` in staged batches grouped by module.

Writes a temporary lessons CSV per batch and invokes the generator.
"""
import csv
import argparse
from pathlib import Path
import subprocess
import os
import sys


def load_rows(lessons_csv: Path):
    with lessons_csv.open(newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        rows = [ {k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in r.items()} for r in reader ]
    return reader.fieldnames, rows


def group_modules(rows):
    modules = {}
    for r in rows:
        key = (r.get('course_slug'), r.get('module_slug'))
        modules.setdefault(key, []).append(r)
    # return list of (course,module, [rows]) tuples
    grouped = [ (k[0], k[1], v) for k, v in modules.items() ]
    # sort for deterministic order
    grouped.sort()
    return grouped


def write_batch_csv(fieldnames, rows, outpath: Path):
    outpath.parent.mkdir(parents=True, exist_ok=True)
    with outpath.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def run_batch(generator_py: Path, batch_csv: Path, models: str, timeout: int, extra_env: dict):
    cmd = [sys.executable, str(generator_py), '--lessons', str(batch_csv), '--models', models, '--timeout', str(timeout)]
    env = os.environ.copy()
    env.update(extra_env)
    print(f"Running batch with {len(open(batch_csv, 'r', encoding='utf-8').readlines())-1} lessons: {cmd}")
    proc = subprocess.run(cmd, env=env)
    return proc.returncode


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--lessons', type=Path, default=Path('scripts/data/lessons.csv'))
    parser.add_argument('--batch-size', type=int, default=10, help='Number of modules per batch')
    parser.add_argument('--models', type=str, default='lms-small,llama3.2:3b')
    parser.add_argument('--warmup', type=int, default=60)
    parser.add_argument('--timeout', type=int, default=120)
    parser.add_argument('--generator', type=Path, default=Path('scripts/generate_multimodal_content.py'))
    parser.add_argument('--override-prompt', type=Path, default=Path('scripts/prompts/strict_brake_prompt.txt'))
    args = parser.parse_args(argv)

    if not args.lessons.exists():
        print('Lessons CSV not found:', args.lessons)
        return 2

    fieldnames, rows = load_rows(args.lessons)
    grouped = group_modules(rows)

    # create batches of modules
    batches = [ grouped[i:i+args.batch_size] for i in range(0, len(grouped), args.batch_size) ]

    tmp_dir = Path('scripts/data/tmp_batches')
    tmp_dir.mkdir(parents=True, exist_ok=True)

    for idx, batch in enumerate(batches, start=1):
        # flatten rows for this batch
        batch_rows = []
        for c, m, rlist in batch:
            batch_rows.extend(rlist)

        batch_csv = tmp_dir / f'lessons_batch_{idx}.csv'
        write_batch_csv(fieldnames, batch_rows, batch_csv)

        extra_env = {
            'MM_GPU_WARMUP_SECONDS': str(args.warmup),
            'MM_OVERRIDE_PROMPT_FILE': str(args.override_prompt) if args.override_prompt.exists() else '',
        }

        rc = run_batch(args.generator, batch_csv, args.models, args.timeout, extra_env)
        if rc != 0:
            print(f'Batch {idx} failed with exit code {rc}; aborting further batches')
            return rc

    print('All batches completed')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
