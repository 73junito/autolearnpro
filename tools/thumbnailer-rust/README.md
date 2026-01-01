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
