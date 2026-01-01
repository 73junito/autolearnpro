#!/usr/bin/env python3
import argparse
import os
from pathlib import Path
from PIL import Image
from multiprocessing import Pool
import time


def process_one(args):
    src, dst_dir, size, quality = args
    dst_path = dst_dir / (src.stem + '.jpg')
    try:
        im = Image.open(src).convert('RGB')
        im = im.resize(size, Image.LANCZOS)
        dst_dir.mkdir(parents=True, exist_ok=True)
        im.save(dst_path, format='JPEG', quality=quality)
        return True
    except Exception as e:
        return False


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--width', type=int, default=240)
    p.add_argument('--height', type=int, default=160)
    p.add_argument('--workers', type=int, default=4)
    p.add_argument('--benchmark', action='store_true')
    p.add_argument('--quality', type=int, default=85, help='JPEG quality (0-100)')
    args = p.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    files = sorted([p for p in input_dir.iterdir() if p.suffix.lower() in ('.png', '.jpg', '.jpeg')])
    tasks = [(f, output_dir, (args.width, args.height), args.quality) for f in files]

    start = time.perf_counter()
    if args.workers <= 1:
        results = [process_one(t) for t in tasks]
    else:
        with Pool(processes=args.workers) as pool:
            results = pool.map(process_one, tasks)
    elapsed = (time.perf_counter() - start) * 1000.0
    print(f"processed {len(files)} files in {elapsed:.2f}ms")


if __name__ == '__main__':
    main()
