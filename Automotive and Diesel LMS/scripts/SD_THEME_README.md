Stable Diffusion Theme Generator

This folder contains a small utility to generate theme/background images using Hugging Face `diffusers`.

Requirements
- Python 3.10+
- A suitable `torch` build for your hardware (CPU or CUDA). See https://pytorch.org/get-started/locally/
- Install packages (example using pip):

```powershell
python -m pip install --upgrade pip
pip install diffusers transformers accelerate safetensors "torch" "xformers" --extra-index-url https://download.pytorch.org/whl/cu121
```

Note: the `torch` and `xformers` installation varies by platform and CUDA version. If you don't have CUDA, install the CPU-only `torch` wheel.

Obtain a Hugging Face token and set it as an environment variable:

```powershell
$env:HF_TOKEN = "hf_xxx..."
```

Usage

```powershell
python scripts\generate_theme_with_sd.py --prompt "a cinematic automotive workshop, dramatic lighting, blue-indigo gradient, high detail" --num-images 1 --out-dir frontend\web\public\images --width 1600 --height 900
```

What to do with generated images
- The script saves images to `frontend/web/public/images` (default).
- In your CSS, reference `/images/sd_theme_1.png` as a background-image for the hero or other sections.
- Example CSS snippet to set hero background (add to `globals.css` or component CSS):

```css
.hero-bg {
  background-image: url('/images/sd_theme_1.png');
  background-size: cover;
  background-position: center;
}
```

Security & moderation
- Generated images may be subject to the model's safety filters. Review outputs before publishing.
- Respect license and model usage terms from Hugging Face and the model owner.
