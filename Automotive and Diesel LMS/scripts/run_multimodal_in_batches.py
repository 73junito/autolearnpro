#!/usr/bin/env python3
"""
Run multimodal generation in manageable batches to avoid long single-process timeouts.
This script slices `scripts/data/lessons.csv` into batches and invokes
`generate_multimodal_content.py` for each batch.

Usage:
  python scripts/run_multimodal_in_batches.py --batch-size 20 --pause 5

Options:
  --lessons    path to full lessons CSV (default: scripts/data/lessons.csv)
  --batch-size number of lessons per batch (default: 20)
  --pause      seconds to wait between batches (default: 5)
  --start      zero-based index of lesson to start from (default: 0)
  --models     comma-separated models to pass through to generator
  --timeout    base timeout to pass to generator (seconds)
  --dry-run    do not execute generator, just print planned batches

The script writes temporary batch CSVs to `scripts/data/_batches/` and
invokes the generator for each batch. Logs generator exit codes and stops on errors.
"""
import argparse
import csv
from pathlib import Path
import subprocess
import time
import shutil

BATCH_DIR = Path('scripts/data/_batches')
GEN_SCRIPT = Path('scripts/generate_multimodal_content.py')


def load_rows(path: Path):
    rows = []
    with path.open(newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def write_batch(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        return
    with path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def run_batch_script(batch_csv: Path, models: str, timeout: int, dry_run: bool):
    cmd = ["python", str(GEN_SCRIPT), "--lessons", str(batch_csv), "--out-dir", "scripts/data/multimodal", "--sql-out", f"scripts/data/multimodal_updates_{batch_csv.stem}.sql", "--models", models, "--timeout", str(timeout)]
    print('Running:', ' '.join(cmd))
    if dry_run:
        return 0
    proc = subprocess.run(cmd)
    return proc.returncode


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--lessons', type=Path, default=Path('scripts/data/lessons.csv'))
    p.add_argument('--batch-size', type=int, default=20)
    p.add_argument('--pause', type=int, default=5)
    p.add_argument('--start', type=int, default=0)
    p.add_argument('--models', type=str, default='lms-assistant:latest')
    p.add_argument('--timeout', type=int, default=120)
    p.add_argument('--dry-run', action='store_true')
    args = p.parse_args()

    if not args.lessons.exists():
        print('Lessons CSV not found:', args.lessons)
        return 2

    rows = load_rows(args.lessons)
    total = len(rows)
    print(f'Loaded {total} lessons')

    BATCH_DIR.mkdir(parents=True, exist_ok=True)
    idx = args.start
    batch_no = 0
    while idx < total:
        batch_rows = rows[idx: idx + args.batch_size]
        batch_csv = BATCH_DIR / f'batch_{batch_no}.csv'
        write_batch(batch_csv, batch_rows)
        print(f'Prepared batch {batch_no}: {len(batch_rows)} lessons -> {batch_csv}')
        rc = run_batch_script(batch_csv, args.models, args.timeout, args.dry_run)
        print(f'Batch {batch_no} exit code: {rc}')
        if rc != 0 and not args.dry_run:
            print('Stopping early due to non-zero exit code')
            return rc
        batch_no += 1
        idx += args.batch_size
        print(f'Pausing for {args.pause}s before next batch...')
        time.sleep(args.pause)

    print('All batches processed')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
