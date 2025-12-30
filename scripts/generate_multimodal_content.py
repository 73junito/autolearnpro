#!/usr/bin/env python3
"""
Generate multimodal lesson content using Ollama (or a fallback).

Reads `scripts/data/lessons.csv` (or a specified CSV) and for each lesson
calls the specified model(s) to generate JSON with keys:
  - written_steps (markdown string)
  - audio_script (string)
  - practice_activities (JSON array)
  - visual_diagrams (JSON array of specs)

Outputs per-lesson JSON files to
`scripts/data/multimodal/<course_slug>/<module_slug>/<lesson_slug>.json`
and appends SQL update statements to `scripts/data/multimodal_updates.sql`
which can be applied to the Postgres database (module_lessons table) using
psql.

This script implements a robust "Strategy B" retry wrapper: for each lesson it
tries multiple models (in order) and performs up to 3 prompt attempts per model
with stricter prompting on retries. Falls back to placeholder content when all
attempts fail.

Usage:
  python scripts/generate_multimodal_content.py [--lessons CSV]
  [--out-dir DIR] [--models LIST] [--sql-out FILE]

Options:
  --lessons   path to lessons CSV (default: scripts/data/lessons.csv)
  --out-dir   output directory for JSON (default: scripts/data/multimodal)
  --models    comma-separated Ollama model names to try in order
              (default includes lms-assistant and others)
  --sql-out   path to write SQL updates
              (default: scripts/data/multimodal_updates.sql)
  --dry-run   do not call Ollama, generate placeholders
  --timeout   seconds to wait for model call (default 120)

"""
import csv
import json
import argparse
import subprocess
import shutil
from pathlib import Path
from datetime import datetime, timezone
import re
import time
import os

DEFAULT_MODELS = [
    "lms-assistant:latest",
    "mistral:7b",
    "llama3.1:latest",
    "qwen3-vl:8b",
]

PROMPT_TEMPLATE_BASE = (
    "You are a technical instructional designer. Generate multimodal lesson "
    "content for the lesson described below. Return ONLY a single valid JSON "
    "object with keys: written_steps (markdown string), audio_script "
    "(plain text), practice_activities (JSON array), visual_diagrams "
    "(JSON array). No surrounding text."
)
PROMPT_TEMPLATE_DETAILS = (
    "\n\nLesson metadata:\n- course: {course}\n- module: {module}\n"
    "- lesson_title: {title}\n- lesson_type: {lesson_type}\n"
    "- duration_minutes: {duration}\n\n"
    "Requirements:\n- written_steps: 6-12 numbered markdown steps with "
    "safety and verification checklist.\n"
    "- audio_script: 90-180 second conversational instructor script.\n"
    "- practice_activities: array of 1-2 scenario objects with fields: "
    "type, title, description, questions.\n"
    "- visual_diagrams: array of 0-2 objects describing diagrams "
    "(type, description, labels).\n\n"
    "IMPORTANT: Output ONLY valid JSON."
)

LOG_DIR = Path("scripts/data/logs")

# per-model timeout multipliers for heavier models that take longer
MODEL_TIMEOUT_MULTIPLIER = {
    "qwen": 4,
    "8b": 4,
    "mistral": 2,
    "llama3": 2,
    "llama": 2,
}


def detect_ollama():
    return shutil.which("ollama") is not None


def run_model(model: str, prompt: str, timeout: int = 120):
    try:
        proc = subprocess.run(
            ["ollama", "run", model, "--nowordwrap"],
            input=prompt,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        return proc.returncode, proc.stdout or "", proc.stderr or ""
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    except FileNotFoundError:
        return 127, "", "ollama not found"


def extract_json(text: str):
    # Try strict JSON first, then extract first object-like block
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            # attempt some simple cleanup: remove trailing commas on objects/arrays
            candidate = re.sub(r",(\s*[\}\]])", r"\1", m.group(0))
            try:
                return json.loads(candidate)
            except Exception:
                return None


def placeholder_content(row):
    title = row.get("title") or row.get("lesson_slug")
    written = (
        "1. Review safety precautions.\n"
        "2. Gather required tools.\n"
        "3. Perform visual inspection.\n"
        "4. Run diagnostic tests.\n"
        "5. Execute service steps.\n"
        "6. Verify operation and document results.\n\n"
        "**Verification checklist**\n"
        "- Safety equipment used\n"
        "- Measurements within spec\n"
    )
    audio = (
        f"This is a short instructor script for {title}. "
        f"Follow safety procedures, then walk through the steps "
        f"and conclude with verification."
    )
    practice = [{
        "type": "scenario",
        "title": "Basic diagnostic",
        "description": "Use the provided data to identify the issue.",
        "questions": [
            {
                "question": "What is the first step?",
                "options": ["Inspect", "Replace"],
                "correct": 0,
            }
        ]
    }]
    visuals = []
    return {
        "written_steps": written,
        "audio_script": audio,
        "practice_activities": practice,
        "visual_diagrams": visuals,
    }


def write_json(outpath: Path, data: dict):
    outpath.parent.mkdir(parents=True, exist_ok=True)
    with outpath.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def quote_sql_dollar(s: str):
    # normalize line endings to LF for SQL safety
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    tag = "__MD__"
    while tag in s:
        tag += "X"
    return f"${tag}${s}${tag}$"


def build_update_sql(lesson_id: str, content: dict):
    written = content.get("written_steps", "")
    audio = content.get("audio_script", "")
    # ensure written/audio are strings (models may return lists or objects)
    if not isinstance(written, str):
        try:
            if isinstance(written, (list, tuple)):
                written = "\n".join(str(x) for x in written)
            else:
                written = json.dumps(written, ensure_ascii=False)
        except Exception:
            written = json.dumps(written, ensure_ascii=False)

    if not isinstance(audio, str):
        try:
            audio = json.dumps(audio, ensure_ascii=False)
        except Exception:
            audio = str(audio)

    practice = json.dumps(content.get("practice_activities", []), ensure_ascii=False)
    visuals = json.dumps(content.get("visual_diagrams", []), ensure_ascii=False)

    written_q = quote_sql_dollar(written)
    audio_q = quote_sql_dollar(audio)
    practice_q = quote_sql_dollar(practice)
    visuals_q = quote_sql_dollar(visuals)

    sql = (
        f"UPDATE module_lessons SET written_steps = {written_q}, audio_script = {audio_q}, "
        f"practice_activities = {practice_q}::jsonb, visual_diagrams = {visuals_q}::jsonb "
        f"WHERE id = {lesson_id};\n"
    )
    return sql


def write_log(name: str, model: str, prompt: str, rc: int, out: str, err: str, parsed):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat().replace(":", "-")
    # sanitize model name and log 'name' to safe filename (replace unsafe chars)
    safe_model = re.sub(r"[^A-Za-z0-9._-]", "_", model)
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    fname = f"{now}.{safe_name}.{safe_model}.log"
    p = LOG_DIR / fname
    with p.open("w", encoding="utf-8") as f:
        f.write(f"MODEL: {model}\n\n")
        f.write("PROMPT:\n")
        f.write(prompt + "\n\n")
        f.write(f"RETURN CODE: {rc}\n\n")
        f.write("STDOUT:\n")
        f.write(out + "\n\n")
        f.write("STDERR:\n")
        f.write(err + "\n\n")
        f.write("PARSED_JSON:\n")
        f.write(json.dumps(parsed, indent=2, ensure_ascii=False) if parsed is not None else "None")
    return p


def attempt_with_retries(
    models, prompt_base, prompt_details, timeout, max_attempts=3, backoff=1.5
):
    """Try models in order, with up to max_attempts per model.

    Returns (parsed_content, model_used, log_paths).
    """
    logs = []
    for model in models:
        # determine multiplier
        mult = 1
        lname = model.lower()
        for k, v in MODEL_TIMEOUT_MULTIPLIER.items():
            if k in lname:
                mult = v
                break

        # start with base timeout multiplied for model complexity
        model_timeout = int(timeout * mult)
        max_model_timeout = max(model_timeout * 4, 600)

        for attempt in range(1, max_attempts + 1):
            # Optional warmup: allow GPU / model to load before first prompt attempt
            try:
                warmup_seconds = int(os.getenv("MM_GPU_WARMUP_SECONDS", "0"))
            except Exception:
                warmup_seconds = 0
            if attempt == 1 and warmup_seconds > 0:
                print(f"Waiting {warmup_seconds}s to allow GPU/model to load for {model}")
                time.sleep(warmup_seconds)
            if attempt == 1:
                prompt = prompt_base + "\n\n" + prompt_details
            else:
                # stricter instruction on retries
                prompt = (
                    "OUTPUT ONLY VALID JSON. Do NOT include any commentary or "
                    "markdown fences. Return a single JSON object with keys: "
                    "written_steps,audio_script,practice_activities,"
                    "visual_diagrams.\n\n"
                    + prompt_details
                )

            # log model and timeout being used
            print(f"Trying model={model} attempt={attempt} timeout={model_timeout}s")
            rc, out, err = run_model(model, prompt, timeout=model_timeout)
            parsed = extract_json(out)
            logp = write_log(f"attempt{attempt}", model, prompt, rc, out, err, parsed)
            logs.append(str(logp))

            # If parsed, return success
            if parsed:
                return parsed, model, logs

            # If timed out, increase timeout and retry once (up to max_model_timeout)
            # treat common timeout/kill codes as retryable
            if rc in (124, -9) or "timeout" in (err or "").lower():
                print(
                    f"Model {model} timed out at {model_timeout}s; "
                    f"increasing timeout and retrying"
                )
                # exponential backoff for timeout
                model_timeout = min(int(model_timeout * 2), max_model_timeout)
                # try again immediately (consume next attempt)
                continue

            # For other non-success, wait then retry per normal
            time.sleep(backoff)
    return None, None, logs


def setup_argument_parser():
    """Create and configure argument parser."""
    parser = argparse.ArgumentParser(
        description="Generate multimodal content for lessons"
    )
    parser.add_argument(
        "--lessons", type=Path, default=Path("scripts/data/lessons.csv")
    )
    parser.add_argument(
        "--out-dir", type=Path, default=Path("scripts/data/multimodal")
    )
    parser.add_argument(
        "--models",
        type=str,
        default=",".join(DEFAULT_MODELS),
        help="Comma-separated Ollama model names",
    )
    parser.add_argument(
        "--ollama-models-dir",
        type=Path,
        default=None,
        help="Optional path to Ollama models directory (overrides default)",
    )
    parser.add_argument(
        "--sql-out", type=Path, default=Path("scripts/data/multimodal_updates.sql")
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--timeout", type=int, default=int(os.getenv("MM_BASE_TIMEOUT", "120"))
    )
    return parser


def load_prompt_override():
    """Load prompt override from file if specified."""
    override_prompt_file = os.getenv("MM_OVERRIDE_PROMPT_FILE")
    if override_prompt_file:
        try:
            with open(override_prompt_file, "r", encoding="utf-8") as _pf:
                # replace the module-level base prompt with the override
                global PROMPT_TEMPLATE_BASE
                PROMPT_TEMPLATE_BASE = _pf.read()
                print(f"Using override prompt file: {override_prompt_file}")
        except Exception as _e:
            print(
                f"Failed to read override prompt file {override_prompt_file}: {_e}"
            )


def load_lessons_csv(lessons_path):
    """Load and parse lessons CSV file."""
    rows = []
    if not lessons_path.exists():
        print(f"Lessons CSV not found: {lessons_path}")
        return None
    with lessons_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            # strip whitespace from headers and values to avoid BOM/spacing issues
            row = {
                (k.strip() if k else k): (v.strip() if isinstance(v, str) else v)
                for k, v in r.items()
            }
            rows.append(row)
    return rows


def setup_ollama_models_dir(ollama_models_dir):
    """Configure Ollama models directory environment variables."""
    if ollama_models_dir:
        mm_dir = str(ollama_models_dir)
        print(f"Using custom Ollama models dir: {mm_dir}")
        os.environ.setdefault("OLLAMA_MODEL_DIR", mm_dir)
        os.environ.setdefault("OLLAMA_MODELS_DIR", mm_dir)
        os.environ.setdefault("OLLAMA_HOME", mm_dir)
        os.environ.setdefault("OLLAMA_DATA_DIR", mm_dir)


def process_lesson(row, models, use_ollama, timeout, out_dir):
    """Process a single lesson and return results."""
    course = row.get("course_slug")
    module = row.get("module_slug")
    lesson = row.get("lesson_slug")
    lesson_id = row.get("lesson_id")
    title = row.get("title") or lesson
    ltype = row.get("lesson_type") or "lesson"
    duration = row.get("estimated_time_minutes") or "0"

    prompt_details = PROMPT_TEMPLATE_DETAILS.format(
        course=course,
        module=module,
        title=title,
        lesson_type=ltype,
        duration=duration,
    )

    content = None
    model_used = None
    logs = []

    if use_ollama:
        parsed, model_used, logs = attempt_with_retries(
            models,
            PROMPT_TEMPLATE_BASE,
            prompt_details,
            timeout=timeout,
        )
        if parsed:
            content = parsed
            status = "ai"
        else:
            content = placeholder_content(row)
            status = "placeholder"
    else:
        content = placeholder_content(row)
        status = "placeholder"

    outpath = out_dir / course / module / f"{lesson}.json"
    write_json(outpath, content)

    sql = None
    if lesson_id:
        sql = build_update_sql(lesson_id, content)

    return {
        "course": course,
        "module": module,
        "lesson": lesson,
        "lesson_id": lesson_id,
        "status": status,
        "model": model_used,
        "logs": logs,
        "sql": sql,
    }


def main():
    parser = setup_argument_parser()
    args = parser.parse_args()

    load_prompt_override()

    rows = load_lessons_csv(args.lessons)
    if rows is None:
        return 2

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    use_ollama = detect_ollama() and (not args.dry_run)
    setup_ollama_models_dir(args.ollama_models_dir)

    if not use_ollama:
        print(
            "Ollama not available or dry-run specified; "
            "will use placeholder content only."
        )

    sql_lines = []
    summary = []

    for r in rows:
        result = process_lesson(r, models, use_ollama, args.timeout, args.out_dir)
        if result["sql"]:
            sql_lines.append(result["sql"])
        # Don't include sql in summary
        result.pop("sql", None)
        summary.append(result)

    if sql_lines:
        args.sql_out.parent.mkdir(parents=True, exist_ok=True)
        with args.sql_out.open("w", encoding="utf-8") as sf:
            sf.write(f"-- Generated on {datetime.now(timezone.utc).isoformat()}\n")
            for line in sql_lines:
                sf.write(line)
        print(f"Wrote SQL updates to: {args.sql_out}")

    # write summary with metadata
    sum_path = Path("scripts/data/multimodal_generation_summary.json")
    summary_data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "lesson_count": len(summary),
        "lessons": summary,
    }
    sum_path.write_text(
        json.dumps(summary_data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Wrote summary to: {sum_path}")

    print("Done.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
