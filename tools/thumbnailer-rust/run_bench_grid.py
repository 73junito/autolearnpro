#!/usr/bin/env python3
import argparse
import subprocess
import time
import os
import csv
from glob import glob
from pathlib import Path
from PIL import Image
import sys

# ensure local package import works when running from repo root
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from visual_compare import compare_images, make_side_by_side


def ensure_dir(p):
    os.makedirs(p, exist_ok=True)


def create_reference(img_path, size, ref_path):
    with Image.open(img_path) as im:
        im = im.convert('RGB')
        im = im.resize(size, Image.LANCZOS)
        im.save(ref_path, format='PNG')


def run_cmd(cmd):
    start = time.perf_counter()
    r = subprocess.run(cmd, shell=True, check=False)
    elapsed = (time.perf_counter() - start) * 1000.0
    return r.returncode, elapsed


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--rust-cmd', required=True)
    p.add_argument('--python-cmd', required=True)
    p.add_argument('--input', required=True)
    p.add_argument('--outdir', required=True)
    p.add_argument('--width', type=int, default=240)
    p.add_argument('--height', type=int, default=160)
    p.add_argument('--workers', type=int, default=4)
    p.add_argument('--qualities', type=int, nargs='+', default=[90])
    p.add_argument('--sample-count', type=int, default=6)
    args = p.parse_args()

    inp = Path(args.input)
    images = sorted(glob(str(inp / '*.png')) + glob(str(inp / '*.jpg')))
    if not images:
        raise SystemExit('No input images found in ' + str(inp))

    out = Path(args.outdir)
    ensure_dir(out)
    report_path = out / 'bench_report.csv'
    samples_dir = out / 'samples'
    ensure_dir(samples_dir)

    rows = []

    for q in args.qualities:
        rust_out = out / f'rust_q{q}'
        py_out = out / f'python_q{q}'
        ensure_dir(rust_out)
        ensure_dir(py_out)

        rust_cmd = f"{args.rust_cmd} --input {args.input} --output {rust_out} --width {args.width} --height {args.height} --workers {args.workers} --quality {q}"
        py_cmd = f"{args.python_cmd} --input {args.input} --output {py_out} --width {args.width} --height {args.height} --workers {args.workers} --quality {q}"

        print('Running Rust:', rust_cmd)
        rc_rust, t_rust = run_cmd(rust_cmd)
        print('Rust elapsed ms:', t_rust)

        print('Running Python baseline:', py_cmd)
        rc_py, t_py = run_cmd(py_cmd)
        print('Python elapsed ms:', t_py)

        # create references and compute metrics
        for idx, img in enumerate(images):
            img_name = Path(img).name
            ref_path = out / f'ref_{img_name}'
            create_reference(img, (args.width, args.height), ref_path)

            rust_thumb = rust_out / img_name
            py_thumb = py_out / img_name

            if rust_thumb.exists():
                s_r, p_r = compare_images(str(ref_path), str(rust_thumb))
                rows.append(['rust', q, img_name, round(s_r,4), round(p_r,2), round(t_rust,2)])
            else:
                rows.append(['rust', q, img_name, 'NA', 'NA', round(t_rust,2)])

            if py_thumb.exists():
                s_p, p_p = compare_images(str(ref_path), str(py_thumb))
                rows.append(['python', q, img_name, round(s_p,4), round(p_p,2), round(t_py,2)])
            else:
                rows.append(['python', q, img_name, 'NA', 'NA', round(t_py,2)])

            # write sample side-by-side for first N images
            if idx < args.sample_count:
                sdir = samples_dir / f'q{q}'
                ensure_dir(sdir)
                out_srust = sdir / f'rust_{img_name}'
                out_spy = sdir / f'python_{img_name}'
                # create side-by-side images (ref|thumb)
                if rust_thumb.exists():
                    make_side_by_side(str(ref_path), str(rust_thumb), str(out_srust))
                if py_thumb.exists():
                    make_side_by_side(str(ref_path), str(py_thumb), str(out_spy))

    # write CSV report
    with open(report_path, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['implementation','quality','image','ssim','psnr','run_ms'])
        w.writerows(rows)

    print('Wrote report to', report_path)


if __name__ == '__main__':
    main()
