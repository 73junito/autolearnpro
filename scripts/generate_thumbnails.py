#!/usr/bin/env python3
"""
Generate thumbnails for course catalog using an Ollama image model (local REST API).

Usage examples:
  python scripts/generate_thumbnails.py --model "registry.ollama.ai/Flux_AI/Flux_AI:latest" --input courses.json --outdir thumbnails --size 512
  echo -e "Intro to EV\nDiesel Fundamentals" | python scripts/generate_thumbnails.py --model "..." --outdir thumbs

Input formats supported:
- JSON array of objects with 'id' and 'title' keys
- CSV with header containing 'id' and 'title' columns
- Plain newline-separated titles (each line is a title)

The script calls the local Ollama REST API at http://localhost:11434/api/generate and expects
the model to return a JSON with a base64-encoded PNG string in the response text or a raw
base64 blob. The script will attempt to extract base64 and write PNG files named
"<id>_<slugified-title>.png" or sequential indices when id unavailable.
"""
import argparse
import base64
import json
import os
import re
import sys
import subprocess
from pathlib import Path
from typing import List, Dict, Optional

import urllib.request


API_URL = "http://localhost:11434/api/generate"
BASE64_RE = re.compile(r"([A-Za-z0-9+/]{100,}=*)")


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
        f"Output the PNG image as a base64 string only — no extra text. Size: {size}x{size}."
    )
    return prompt


def generate_image_base64(model: str, prompt: str) -> Optional[str]:
    payload = {"model": model, "prompt": prompt, "stream": False, "options": {}}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API_URL, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            # Try to parse JSON first
            try:
                obj = json.loads(body)
                # Common key used earlier was 'response'
                text = obj.get("response") or obj.get("output") or ""
            except Exception:
                text = body

            # Search for a long base64 blob
            m = BASE64_RE.search(text)
            if m:
                return m.group(1)
            # If the whole text looks like base64, return it
            if re.fullmatch(r"[A-Za-z0-9+/=\n\r]+", text.strip()):
                return text.strip().replace("\n", "")
            return None
    except Exception as e:
        print(f"Error calling Ollama REST API: {e}")
        return None


def save_image_b64(b64: str, outpath: Path):
    raw = base64.b64decode(b64)
    with outpath.open("wb") as f:
        f.write(raw)


def main(argv: List[str] = None):
    parser = argparse.ArgumentParser(description="Generate course thumbnails via Ollama image model")
    parser.add_argument("--model", required=False, help="Ollama model identifier or path (eg registry.ollama.ai/Flux_AI/Flux_AI:latest)")
    parser.add_argument("--input", required=False, help="Input file (json/csv/txt). If omitted, reads stdin")
    parser.add_argument("--outdir", default="thumbnails", help="Output directory")
    parser.add_argument("--size", type=int, default=512, help="Square size in pixels")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of thumbnails (0 = all)")
    parser.add_argument("--db", action="store_true", help="Fetch titles from Postgres in cluster (requires kubectl access)")
    parser.add_argument("--pg-pod", required=False, help="Postgres pod name (optional, auto-discovered)")
    parser.add_argument("--namespace", default="autolearnpro", help="K8s namespace for postgres (default autolearnpro)")
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
        b64 = generate_image_base64(model, prompt)
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
