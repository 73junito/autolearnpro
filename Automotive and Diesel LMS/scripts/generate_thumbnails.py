#!/usr/bin/env python3
"""Generate thumbnails for courses using OpenAI DALL-E."""

import os
import sys
import subprocess
from PIL import Image
import io
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from pathlib import Path
from typing import List, Dict, Optional
from .net import get_session, post_json

from .config import validate, ollama_available
import shutil

# Import third-party and local modules after path setup
# ruff: noqa: E402
import openai
import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Course


def get_database_url():
    """Get database URL from environment."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL not set in environment")
        sys.exit(1)
    return database_url


def get_openai_key():
    """Get OpenAI API key from environment."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set in environment")
        sys.exit(1)
    return api_key


def generate_thumbnail(course_title, course_description):
    """Generate a thumbnail using DALL-E."""
    client = openai.OpenAI(api_key=get_openai_key())

    prompt = f"""Create a modern, professional thumbnail for an online course titled '{course_title}'.
    Course description: {course_description}
    Style: Clean, educational, engaging, with relevant imagery."""

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
    """Use Ollama to generate image."""
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
        # First, try to find a long base64 string
        m = BASE64_RE.search(text)
        if m:
            candidate = m.group(1)
            try:
                base64.b64decode(candidate)
                return candidate
            except Exception:
                pass
        # If not found or invalid, try the whole text cleaned
        import string
        allowed = string.ascii_letters + string.digits + '+/=\n\r'
        cleaned = ''.join(c for c in text if c in allowed).strip()
        if cleaned:
            # Add padding if needed
            missing = len(cleaned) % 4
            if missing:
                cleaned += '=' * (4 - missing)
            try:
                base64.b64decode(cleaned)
                return cleaned
            except Exception:
                pass
        # Try parsing JSON body if present
        try:
            obj = json.loads(text)
            t = obj.get("response") or obj.get("output") or ""
            m2 = BASE64_RE.search(t)
            if m2:
                try:
                    base64.b64decode(m2.group(1))
                    return m2.group(1)
                except Exception:
                    pass
        except Exception:
            pass
        return None
    except Exception as e:
        print(f"Error generating thumbnail: {e}")
        return None


def download_image(url, filepath):
    """Download an image from a URL to a local file."""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        with open(filepath, "wb") as f:
            f.write(response.content)

        return True
    except Exception as e:
        print(f"Error downloading image: {e}")
        return False


def generate_simple_thumbnail(title: str, size: int) -> str:
    """Generate a simple thumbnail with title text using Pillow. Returns base64 PNG."""
    from PIL import Image, ImageDraw, ImageFont
    # Create white image
    img = Image.new('RGB', (size, size), color='white')
    draw = ImageDraw.Draw(img)
    # Try to use a font, fallback to default
    try:
        font = ImageFont.truetype("arial.ttf", size // 10)
    except:
        font = ImageFont.load_default()
    # Draw text centered
    bbox = draw.textbbox((0, 0), title, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    draw.text((x, y), title, fill='black', font=font)
    # Save to bytes
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
    return b64


def generate_image_base64(model: str, prompt: str, size: int) -> Optional[str]:
    # If model refers to a local Stable Diffusion checkpoint file, prefer SD WebUI API
    try:
        pm = Path(model)
        if pm.exists():
            img = generate_image_sdwebui(str(pm), prompt, size)
            if img:
                return img
        # If default SD path exists and no explicit model provided, use it
        if not model and SD_WEBUI_DEFAULT.exists():
            img = generate_image_sdwebui(str(SD_WEBUI_DEFAULT), prompt, size)
            if img:
                return img
    except Exception:
        pass
    # Fallback to ollama CLI
    img = _generate_image_cli(model, prompt)
    if img:
        return img
    # Last resort: simple Pillow thumbnail
    print("[INFO] Using simple text-based thumbnail as fallback")
    return generate_simple_thumbnail(prompt.split("'")[1] if "'" in prompt else "Course", size)


def call_mcp_tool(tool: str, payload: dict) -> Optional[dict]:
    """Call local MCP server build CLI to run a tool and return parsed JSON result."""
    node = shutil.which('node') or 'node'
    mcp_cli = Path(__file__).parents[1] / 'mcp server' / 'build' / 'index.js'
    if not mcp_cli.exists():
        print(f"MCP CLI not found at {mcp_cli}")
        return None
    cmd = [node, str(mcp_cli), 'run_tool', tool, json.dumps(payload, ensure_ascii=False)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            print(f"MCP tool error: {r.stderr.strip()}")
            return None
        out = r.stdout.strip()
        if not out:
            print("MCP tool returned no output")
            return None
        return json.loads(out)
    except Exception as e:
        print(f"Failed to call MCP tool: {e}")
        return None

        if limit:
            query = query.limit(limit)

def save_image_b64(b64: str, outpath: Path):
    raw = base64.b64decode(b64)
    image = Image.open(io.BytesIO(raw))
    image.save(outpath, "JPEG")

        if not courses:
            print("No courses found that need thumbnails.")
            return

        print(f"Found {len(courses)} courses to process.")

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
    parser.add_argument("--use-mcp", action="store_true", help="Call local MCP server tool for generation")
    args = parser.parse_args(argv)

        for i, course in enumerate(courses, 1):
            print(f"\n[{i}/{len(courses)}] Processing: {course.title}")

            # Generate thumbnail
            image_url = generate_thumbnail(course.title, course.description or "")

            if not image_url:
                print("  Skipping due to generation error.")
                continue

            # Download image
            filename = f"course_{course.id}.png"
            filepath = thumbnails_dir / filename

            if download_image(image_url, filepath):
                # Update course with local thumbnail path
                course.thumbnail_url = f"/static/thumbnails/{filename}"
                session.commit()
                print(f"  Success! Saved to {filepath}")
            else:
                print("  Failed to download image.")

    except Exception as e:
        print(f"Error processing courses: {e}")
        session.rollback()
    finally:
        session.close()


def main():
    """Main entry point."""
    import argparse

    limit = args.limit or len(items)
    for i, item in enumerate(items[:limit]):
        cid = item.get("id") or str(i + 1)
        title = item.get("title")
        slug = slugify(title)
        outname = f"{cid}_{slug}.jpg"
        outpath = outdir / outname
        prompt = build_prompt(title, args.size)
        print(f"Generating thumbnail for: {title} -> {outpath}")
        b64 = None
        if args.use_mcp:
            payload = {"title": title, "topic": None, "style": "realistic"}
            res = call_mcp_tool('generate_course_thumbnail', payload)
            if res and isinstance(res, dict):
                # Expecting { content: [{ type: 'image', data: '<base64>' }] }
                contents = res.get('content') or []
                if contents and contents[0].get('type') == 'image':
                    b64 = contents[0].get('data')
                else:
                    print(f"MCP returned no image content for {title}")
            else:
                print(f"MCP tool failed for {title}")
        else:
            if args.force_cli:
                print("[INFO] Using ollama CLI (forced)")
                b64 = _generate_image_cli(model, prompt)
            else:
                b64 = generate_image_base64(model, prompt, args.size)
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

    args = parser.parse_args()

    print("Starting thumbnail generation...")
    process_courses(limit=args.limit)
    print("\nDone!")


if __name__ == "__main__":
    main()
