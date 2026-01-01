#!/usr/bin/env python3
"""Generate theme/background images using Stable Diffusion (diffusers).

This script uses Hugging Face `diffusers`. Provide a `HF_TOKEN` env var
or pass `--hf-token`. Outputs images to `--out-dir` (default: frontend/web/public/images).

Notes:
- Install dependencies (see scripts/SD_THEME_README.md).
- When running on GPU, use a torch build with CUDA and optional xformers for memory.
"""

import os
import argparse
from pathlib import Path

try:
    import torch
    from diffusers import StableDiffusionPipeline
except Exception as e:
    raise SystemExit("Missing dependencies. See scripts/SD_THEME_README.md for setup.")


def make_parser():
    p = argparse.ArgumentParser(description="Generate background/theme images with Stable Diffusion")
    p.add_argument("--prompt", type=str, required=True, help="Stable Diffusion prompt for the theme image")
    p.add_argument("--out-dir", type=Path, default=Path("frontend/web/public/images"), help="Output directory")
    p.add_argument("--model", type=str, default="runwayml/stable-diffusion-v1-5", help="HF model repo")
    p.add_argument("--hf-token", type=str, default=None, help="Hugging Face token (or set HF_TOKEN env var)")
    p.add_argument("--device", type=str, default=None, help="Device: cuda or cpu (auto-detect if omitted)")
    p.add_argument("--num-images", type=int, default=1)
    p.add_argument("--height", type=int, default=1024)
    p.add_argument("--width", type=int, default=1024)
    p.add_argument("--steps", type=int, default=30)
    p.add_argument("--guidance", type=float, default=7.5)
    p.add_argument("--seed", type=int, default=None)
    return p


def main():
    parser = make_parser()
    args = parser.parse_args()

    hf_token = args.hf_token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if not hf_token:
        raise SystemExit("Hugging Face token required. Pass --hf-token or set HF_TOKEN env var.")

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")

    print(f"Loading model {args.model} on {device}...")
    dtype = torch.float16 if device.startswith("cuda") else torch.float32
    pipe = StableDiffusionPipeline.from_pretrained(args.model, torch_dtype=dtype, use_auth_token=hf_token)

    if device.startswith("cuda"):
        pipe = pipe.to(device)
        # try enabling memory-efficient attention if available
        if hasattr(pipe, "enable_xformers_memory_efficient_attention"):
            try:
                pipe.enable_xformers_memory_efficient_attention()
            except Exception:
                pass
    else:
        pipe = pipe.to(device)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for i in range(args.num_images):
        prompt = args.prompt
        seed = None if args.seed is None else (args.seed + i)
        generator = None
        if seed is not None:
            try:
                gen_device = device if device == "cpu" else "cuda"
                generator = torch.Generator(device=gen_device).manual_seed(seed)
            except Exception:
                generator = None

        print(f"Generating image {i+1}/{args.num_images} (seed={seed})...")
        out = pipe(
            prompt,
            height=args.height,
            width=args.width,
            guidance_scale=args.guidance,
            num_inference_steps=args.steps,
            generator=generator,
        )

        img = out.images[0]
        filename = out_dir / f"sd_theme_{i+1}.png"
        img.save(str(filename))
        print(f"Saved {filename}")

    print("Done.")


if __name__ == "__main__":
    main()
