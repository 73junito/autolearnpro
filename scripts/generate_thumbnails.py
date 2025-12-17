#!/usr/bin/env python3
"""

Generate thumbnails for course catalog using an Ollama image model (Ollama CLI only; REST API not required).

Usage examples:
  python scripts/generate_thumbnails.py --model "registry.ollama.ai/Flux_AI/Flux_AI:latest" --input courses.json --outdir thumbnails --size 512
  echo -e "Intro to EV\nDiesel Fundamentals" | python scripts/generate_thumbnails.py --model "..." --outdir thumbs

Input formats supported:
- JSON array of objects with 'id' and 'title' keys
- CSV with header containing 'id' and 'title' columns
- Plain newline-separated titles (each line is a title)

The script uses the Ollama CLI (not the REST API) to generate images. It expects the CLI to return a base64-encoded PNG string in the response text or a raw base64 blob. The script will attempt to extract base64 and write PNG files named
"<id>_<slugified-title>.png" or sequential indices when id unavailable.
"""
import argparse
import base64
import json
import os
import re
import sys
import subprocess
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from pathlib import Path
from typing import List, Dict, Optional
from scripts.net import get_session, post_json

from scripts.config import validate, ollama_available

# REST API is not used; CLI only
BASE64_RE = re.compile(r"([A-Za-z0-9+/]{100,}=*)")

# Default local Stable Diffusion WebUI model path (Windows)
SD_WEBUI_DEFAULT = Path(r"C:\stable-diffusion-webui\stable-diffusion-webui\models\Stable-diffusion\dreamshaper_8.safetensors")
SD_WEBUI_API = os.getenv("SD_WEBUI_API", "http://127.0.0.1:7860")


def slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:40]


def read_input(path: Optional[str]) -> List[Dict[str, str]]:
    items = []
    if path is None:
        # read titles from stdin
        data = sys.stdin.read().strip()
        if not data:
            return []
        for i, line in enumerate(data.splitlines(), 1):
            title = line.strip()
            if title:
                items.append({"id": str(i), "title": title})
        return items

    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(path)

    if p.suffix.lower() == ".json":
        with p.open(encoding="utf-8") as f:
            obj = json.load(f)
            if isinstance(obj, list):
                for i, it in enumerate(obj):
                    if isinstance(it, dict):
                        title = it.get("title") or it.get("name")
                        idv = str(it.get("id") or it.get("slug") or i + 1)
                        if title:
                            items.append({"id": idv, "title": title})
                    else:
                        items.append({"id": str(i + 1), "title": str(it)})
            else:
                raise ValueError("JSON input must be an array")
        return items

    if p.suffix.lower() in (".csv", ".tsv"):
        import csv

        delim = "\t" if p.suffix.lower() == ".tsv" else ","
        with p.open(encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter=delim)
            for i, row in enumerate(reader, 1):
                title = row.get("title") or row.get("name")
                idv = row.get("id") or row.get("slug") or str(i)
                if title:
                    items.append({"id": str(idv), "title": title})
        return items

    # Plain text
    with p.open(encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            title = line.strip()
            if title:
                items.append({"id": str(i), "title": title})
    return items


def fetch_from_db(sql: str, pg_pod: Optional[str], namespace: str = "autolearnpro") -> List[Dict[str, str]]:
    """Run SQL via kubectl exec into postgres pod and parse tab-separated output (id\ttitle)."""
    if not pg_pod:
        # discover pod
        try:
            r = subprocess.run(
                ["kubectl", "get", "pod", "-n", namespace, "-l", "app=postgres", "-o", "jsonpath={.items[0].metadata.name}"],
                capture_output=True, text=True, timeout=10
            )
            pg_pod = r.stdout.strip()
        except Exception as e:
            raise RuntimeError(f"Failed to find postgres pod: {e}")

    cmd = [
        "kubectl", "exec", "-n", namespace, pg_pod, "--",
        "psql", "-U", "postgres", "-d", "lms_api_prod", "-t", "-A", "-F", "\t", "-c", sql
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            raise RuntimeError(f"psql error: {r.stderr.strip()}")
        out = r.stdout.strip()
        items: List[Dict[str, str]] = []
        if not out:
            return items
        for i, line in enumerate(out.splitlines(), 1):
            parts = line.split("\t")
            if len(parts) >= 2:
                items.append({"id": parts[0], "title": parts[1]})
            else:
                items.append({"id": str(i), "title": parts[0]})
        return items
    except Exception as e:
        raise RuntimeError(f"Failed to fetch from DB: {e}")


def build_prompt(title: str, size: int) -> str:
    # Prompt tailored to Flux_AI image model; adjust as needed for your model
    prompt = (
        f"Create a clean, professional square thumbnail (PNG) for an online course titled '{title}'. "
        "Use bold readable title text over a simple illustrative background that hints at the topic. "
        "Avoid small details. Use a limited color palette and high contrast. "
        f"Output the PNG image as a base64 string only. No extra text. Size: {size}x{size}."
    )
    return prompt


def _generate_image_cli(model: str, prompt: str) -> Optional[str]:
    """Fallback: call `ollama run <model>` via subprocess and extract base64 from stdout."""
    try:
        result = subprocess.run(
            ["ollama", "run", model, "--nowordwrap"],
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        if result.returncode != 0:
            print(f"ollama CLI failed: {result.stderr}")
            return None
        text = result.stdout or ""
        m = BASE64_RE.search(text)
        if m:
            return m.group(1)
        if re.fullmatch(r"[A-Za-z0-9+/=\n\r]+", text.strip()):
            return text.strip().replace("\n", "")
        # Try parsing JSON body if present
        try:
            obj = json.loads(text)
            t = obj.get("response") or obj.get("output") or ""
            m2 = BASE64_RE.search(t)
            if m2:
                return m2.group(1)
        except Exception:
            pass
        return None
    except Exception as e:
        print(f"Error calling ollama CLI: {e}")
        return None


def generate_image_sdwebui(model_path: str, prompt: str, size: int) -> Optional[str]:
    """Use Stable Diffusion WebUI's /sdapi/v1/txt2img endpoint. Returns base64 PNG string or None."""
    try:
        model_name = Path(model_path).name
        url = f"{SD_WEBUI_API.rstrip('/')}/sdapi/v1/txt2img"
        payload = {
            "prompt": prompt,
            "width": size,
            "height": size,
            "steps": 20,
            "cfg_scale": 7.5,
            "sampler_name": "Euler a",
            "sd_model_checkpoint": model_name,
        }

        obj = post_json(url, payload, timeout=120)
        images = obj.get("images") or []
        if images:
            return images[0]
        return None
    except Exception as e:
        print(f"Error calling Stable Diffusion WebUI API: {e}")
        return None


def generate_image_base64(model: str, prompt: str, size: int) -> Optional[str]:
    # If model refers to a local Stable Diffusion checkpoint file, prefer SD WebUI API
    try:
        pm = Path(model)
        if pm.exists():
            return generate_image_sdwebui(str(pm), prompt, size)
        # If default SD path exists and no explicit model provided, use it
        if not model and SD_WEBUI_DEFAULT.exists():
            return generate_image_sdwebui(str(SD_WEBUI_DEFAULT), prompt, size)
    except Exception:
        pass
    # Fallback to ollama CLI
    return _generate_image_cli(model, prompt)


def save_image_b64(b64: str, outpath: Path):
    raw = base64.b64decode(b64)
    with outpath.open("wb") as f:
        f.write(raw)


def main(argv: List[str] = None):
    # Validate environment
    validate(require_db=False, require_ollama=False)

    parser = argparse.ArgumentParser(description="Generate course thumbnails via Ollama image model")
    parser.add_argument("--model", required=False, help="Ollama model identifier or path (eg registry.ollama.ai/Flux_AI/Flux_AI:latest)")
    parser.add_argument("--input", required=False, help="Input file (json/csv/txt). If omitted, reads stdin")
    parser.add_argument("--outdir", default="thumbnails", help="Output directory")
    parser.add_argument("--size", type=int, default=512, help="Square size in pixels")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of thumbnails (0 = all)")
    parser.add_argument("--db", action="store_true", help="Fetch titles from Postgres in cluster (requires kubectl access)")
    parser.add_argument("--pg-pod", required=False, help="Postgres pod name (optional, auto-discovered)")
    parser.add_argument("--namespace", default="autolearnpro", help="K8s namespace for postgres (default autolearnpro)")
    parser.add_argument("--force-cli", action="store_true", help="Force using ollama CLI instead of REST API")
    args = parser.parse_args(argv)

    # Resolve model: CLI -> env -> known local manifest -> error
    model = args.model or os.getenv("IMAGE_MODEL") or os.getenv("OLLAMA_IMAGE_MODEL")
    # Known local Ollama manifest path (Windows default from user)
    local_manifest = Path(r"C:\Users\rod63\.ollama\models\manifests\registry.ollama.ai\Flux_AI\Flux_AI\latest")
    if not model and local_manifest.exists():
        # Use registry identifier when local manifest exists
        model = "registry.ollama.ai/Flux_AI/Flux_AI:latest"

    if not model:
        print("Model not specified. Provide --model or set IMAGE_MODEL env var.")
        print("Example: --model 'registry.ollama.ai/Flux_AI/Flux_AI:latest'")
        return 2

    # Warn if ollama CLI not found and user didn't force a different backend
    if not ollama_available() and not args.force_cli:
        print("Warning: 'ollama' CLI not found. Use --force-cli to bypass or install ollama.")

    items = []
    try:
        if args.db:
            sql = "SELECT id, title FROM courses WHERE title IS NOT NULL;"
            items = fetch_from_db(sql, args.pg_pod, args.namespace)
        else:
            items = read_input(args.input)
    except Exception as e:
        print(f"Failed to read input: {e}")
        return 2

    if not items:
        print("No courses found in input. Expecting titles via file or stdin.")
        return 1

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    limit = args.limit or len(items)
    for i, item in enumerate(items[:limit]):
        cid = item.get("id") or str(i + 1)
        title = item.get("title")
        slug = slugify(title)
        outname = f"{cid}_{slug}.png"
        outpath = outdir / outname
        prompt = build_prompt(title, args.size)
        print(f"Generating thumbnail for: {title} -> {outpath}")
        if args.force_cli:
            print("[INFO] Using ollama CLI (forced)")
            b64 = _generate_image_cli(model, prompt)
        else:
            b64 = generate_image_base64(model, prompt)
            if not b64:
                print("[WARN] REST API returned no image; attempting ollama CLI fallback")
                b64 = _generate_image_cli(model, prompt)
        if not b64:
            print(f"Failed to generate image for: {title}")
            continue
        try:
            save_image_b64(b64, outpath)
            print(f"Saved: {outpath}")
        except Exception as e:
            print(f"Failed to save image for {title}: {e}")

    return 0


if __name__ == "__main__":
    import argparse
    sys.exit(main())
