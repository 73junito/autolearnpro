Extended benchmarks and visual samples
------------------------------------

There is a small benchmark harness and visual-compare utility in this folder:

- `requirements.txt`: Python deps for the comparison tools (`Pillow`, `scikit-image`, `numpy`).
- `run_bench_grid.py`: Runs Rust and Python thumbnailers across a grid of `--quality` values, records timings and per-image SSIM/PSNR, and writes `bench_report.csv` plus sample side-by-side images.
- `visual_compare.py`: Helper functions to compute SSIM/PSNR and to create side-by-side reference vs thumbnail images.

Quick local run (create sample images first or point `--input` to a directory of images):

```
python -m pip install -r tools/thumbnailer-rust/requirements.txt
python tools/thumbnailer-rust/run_bench_grid.py --rust-cmd "cargo run --release --manifest-path tools/thumbnailer-rust/Cargo.toml --" --python-cmd "python tools/python_thumbnailer.py" --input sample_images --outdir bench_results --qualities 80 90 95
```

Output:

- `bench_results/bench_report.csv` — CSV with per-image SSIM/PSNR and run times.
- `bench_results/samples/` — side-by-side example images showing reference | thumbnail for Rust and Python outputs.

The CI workflow has been updated to run this grid and attach `bench-results.zip` as an artifact.
# Thumbnailer (Rust)

Small Rust CLI to generate thumbnails in parallel. Intended as a prototype to compare performance vs the existing Python `scripts/generate_thumbnails.py`.

Usage:

```
cargo run --release -- --input /path/to/images --output /path/to/thumbs --width 240 --height 160 --workers 4 --benchmark
```

Flags:

- `--quality`: JPEG quality (0-100). Default: 85.

- `--format`: Output format (`jpeg`, `png`, `webp`). Default: `jpeg`.

Example (set quality):

```
cargo run --release -- --input /path/to/images --output /path/to/thumbs --quality 95 --benchmark
```

Example (set format to webp):

```
cargo run --release -- --input /path/to/images --output /path/to/thumbs --format webp --quality 80 --benchmark
```

Build a release binary:

```
cargo build --release
```

Docker (build):

```
docker build -t thumbnailer:latest .
```

Benchmarks
----------

Dataset used for these quick checks: 20 generated 1920x1080 PNGs (see CI job).

Measured timings (wall clock, full run over 20 images):

- Rust (release, local): ~129 ms (20 files)
- Rust (release, CI Ubuntu run 20646679612): 319.31 ms (20 files)
- Python baseline (local): ~267 ms (20 files)
- Python baseline (CI Ubuntu run 20646679612): 421.29 ms (20 files)

Basic file-size comparison (20 thumbnails):

- Rust (WebP output): mean ≈ 170 bytes
- Python (JPEG output): mean ≈ 1,228 bytes

Artifacts and example thumbnails from the CI run are attached in the release:
https://github.com/73junito/autolearnpro/releases/tag/thumb-bench-20260101-165255

Reproduce the CI run locally (quick):

```
cargo build --release --manifest-path tools/thumbnailer-rust/Cargo.toml
cargo run --release --manifest-path tools/thumbnailer-rust/Cargo.toml -- --input sample_images --output sample_thumbs --width 240 --height 160 --workers 4 --benchmark
python tools/python_thumbnailer.py --input sample_images --output sample_thumbs_py --width 240 --height 160 --workers 4 --benchmark
```

Notes:
- Results vary with CPU, I/O and platform; CI numbers reflect the GitHub Actions Ubuntu runner.
- The goal here is an apples-to-apples prototype comparison; consider running SSIM/PSNR checks for visual parity if you want quality comparisons at different `--quality` values.
