# Thumbnailer (Rust)

Small Rust CLI to generate thumbnails in parallel. Intended as a prototype to compare performance vs the existing Python `scripts/generate_thumbnails.py`.

Usage:

```
cargo run --release -- --input /path/to/images --output /path/to/thumbs --width 240 --height 160 --workers 4 --benchmark
```

Build a release binary:

```
cargo build --release
```

Docker (build):

```
docker build -t thumbnailer:latest .
```
