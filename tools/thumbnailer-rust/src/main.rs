use clap::Parser;
use image::imageops::FilterType;
use rayon::prelude::*;
use std::{fs, path::PathBuf, time::Instant};
use walkdir::WalkDir;

#[derive(Parser)]
#[command(version)]
struct Args {
    /// Input directory containing images
    #[arg(short, long)]
    input: PathBuf,

    /// Output directory for thumbnails
    #[arg(short, long)]
    output: PathBuf,

    /// Thumbnail width
    #[arg(short, long, default_value_t = 240)]
    width: u32,

    /// Thumbnail height
    #[arg(short, long, default_value_t = 160)]
    height: u32,

    /// Number of worker threads (optional)
    #[arg(short, long)]
    workers: Option<usize>,

    /// Print simple benchmark timing
    #[arg(long, default_value_t = false)]
    benchmark: bool,
}

fn main() {
    let args = Args::parse();

    if let Some(n) = args.workers {
        rayon::ThreadPoolBuilder::new()
            .num_threads(n)
            .build_global()
            .ok();
    }

    let start = Instant::now();

    let mut files: Vec<PathBuf> = WalkDir::new(&args.input)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| {
                    let s = s.to_lowercase();
                    matches!(s.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tiff")
                })
                .unwrap_or(false)
        })
        .map(|e| e.path().to_path_buf())
        .collect();

    files.par_iter().for_each(|path| {
        if let Err(e) = process_image(path, &args.input, &args.output, args.width, args.height) {
            eprintln!("failed {}: {}", path.display(), e);
        }
    });

    let elapsed = start.elapsed();
    if args.benchmark {
        println!("processed {} files in {:.2?}", files.len(), elapsed);
    } else {
        println!("done: processed {} files", files.len());
    }
}

fn process_image(path: &PathBuf, root: &PathBuf, out_root: &PathBuf, w: u32, h: u32) -> Result<(), String> {
    let img = image::open(path).map_err(|e| format!("open error: {}", e))?;
    let thumb = img.resize(w, h, FilterType::Lanczos3);

    let rel = path.strip_prefix(root).map_err(|e| format!("strip_prefix: {}", e))?;
    let mut out_path = out_root.join(rel);
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
    }
    out_path.set_extension("jpg");

    thumb
        .save_with_format(out_path, image::ImageFormat::Jpeg)
        .map_err(|e| format!("save error: {}", e))?;

    Ok(())
}
