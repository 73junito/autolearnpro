#!/usr/bin/env python3
"""
GPU-Accelerated 200K Question Generator v2
DEFENSIVE IMPLEMENTATION with:
- Hard token limits via custom model
- Subprocess timeouts (120s)
- Batch-level fail-safes
- Progress checkpointing
- Automatic resume capability
"""
import subprocess
import json
import sys
import signal
import os
import shutil
import platform
from datetime import datetime
from pathlib import Path
from time import time, sleep
import re

# ============================================================================
# CONFIGURATION
# ============================================================================
MODEL = "lms-assistant:latest"  # GPU-optimized model
BATCH_SIZE = 1  # Start with 1 question per call (safer)
QUESTIONS_PER_RUN = 50
TOTAL_TARGET = 200000
PROGRESS_FILE = Path("scripts/.question_progress.json")
LOG_FILE = Path(f"scripts/question_generation_gpu_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

# Distribution
DISTRIBUTION = {
    "categories": {
        "ev": 0.25,
        "diesel": 0.20,
        "engine_performance": 0.20,
        "electrical": 0.20,
        "brakes": 0.15,
    },
    "question_types": {
        "multiple_choice": 0.40,
        "true_false": 0.35,
        "fill_blank": 0.25,
    },
    "difficulties": {"easy": 0.30, "medium": 0.50, "hard": 0.20},
}

ASE_STANDARDS = {
    "ev": ["L3.A.1", "L3.A.2", "L3.A.3", "L3.B.1", "L3.B.2", "L3.C.1"],
    "diesel": ["T2.A.1", "T2.A.2", "T2.B.1", "T2.C.1", "T2.D.1", "T2.E.1"],
    "engine_performance": ["A8.A.1", "A8.A.2", "A8.B.1", "A8.C.1", "A8.D.1", "A8.E.1"],
    "brakes": ["A5.A.1", "A5.A.2", "A5.B.1", "A5.C.1", "A5.D.1", "A5.E.1"],
    "electrical": ["A6.A.1", "A6.A.2", "A6.B.1", "A6.C.1", "A6.D.1", "A6.E.1"],
}

# ============================================================================
# SIGNAL HANDLING
# ============================================================================
interrupted = False

def signal_handler(sig, frame):
    global interrupted
    interrupted = True
    log("\n[WARN] User interrupted - saving progress and exiting safely...", "WARN")

signal.signal(signal.SIGINT, signal_handler)

# ============================================================================
# LOGGING
# ============================================================================

def log(message, level="INFO"):
    """Thread-safe logging"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = f"[{timestamp}] [{level}] {message}"

    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_msg + "\n")
    except Exception:
        # Best-effort logging; do not fail the generator on log errors
        pass

    colors = {"ERROR": "\033[91m", "WARN": "\033[93m", "SUCCESS": "\033[92m", "INFO": "\033[0m"}
    print(f"{colors.get(level, '')}{message}\033[0m")

def detect_gpu_available() -> bool:
    """Detect whether a GPU is available on the host (Windows-friendly).

    Checks for nvidia-smi on PATH, common Windows install paths, and WSL.
    """
    # Env overrides
    if os.getenv("FORCE_CPU", "") in ("1", "true", "True", "TRUE"):
        return False
    if os.getenv("FORCE_GPU", "") in ("1", "true", "True", "TRUE"):
        return True

    # Check nvidia-smi on PATH
    if shutil.which("nvidia-smi"):
        return True

    # On Windows, check common install directories for nvidia-smi.exe
    if platform.system() == "Windows":
        candidates = [
            r"C:\Program Files\NVIDIA GPU Computing Toolkit",
            r"C:\Program Files\NVIDIA Corporation",
        ]
        for base in candidates:
            for root, _, files in os.walk(base) if os.path.exists(base) else []:
                if "nvidia-smi.exe" in files:
                    return True

    # Try WSL nvidia-smi if wsl command exists
    if shutil.which("wsl"):
        try:
            r = subprocess.run(["wsl", "nvidia-smi"], capture_output=True, text=True, timeout=5)
            if r.returncode == 0 and "GPU" in r.stdout:
                return True
        except Exception:
            pass

    return False

# ============================================================================
# PROGRESS MANAGEMENT
# ============================================================================

def load_progress():
    """Load progress from checkpoint"""
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE, "r") as f:
                data = json.load(f)
                # Defensive: ensure required keys exist
                if not isinstance(data, dict):
                    data = {}
                if "total_generated" not in data:
                    data["total_generated"] = 0
                if "last_updated" not in data:
                    data["last_updated"] = None
                return data
        except Exception as e:
            log(f"Failed to load progress file: {e}", "WARN")
    return {"total_generated": 0, "last_updated": None}

def save_progress(progress):
    """Save progress checkpoint"""
    progress["last_updated"] = datetime.now().isoformat()
    try:
        with open(PROGRESS_FILE, "w") as f:
            json.dump(progress, f, indent=2)
    except Exception as e:
        log(f"Failed to save progress: {e}", "ERROR")

# ============================================================================
# DATABASE
# ============================================================================

def get_postgres_pod():
    """Get postgres pod name with timeout"""
    try:
        result = subprocess.run([
            "kubectl", "get", "pod", "-n", "autolearnpro", "-l", "app=postgres",
            "-o", "jsonpath={.items[0].metadata.name}"
        ], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=10)
        pod = result.stdout.strip()
        if pod:
            return pod
    except Exception as _:
        pass
    log("Failed to find postgres pod", "ERROR")
    sys.exit(1)

def get_or_create_bank(category, difficulty, pg_pod):
    """Get or create question bank"""
    name = f"{category.upper()} - {difficulty.upper()}"

    # Check existing
    check_sql = f"SELECT id FROM question_banks WHERE name = '{name}' LIMIT 1;"
    try:
        result = subprocess.run(
            [
                "kubectl",
                "exec",
                "-n",
                "autolearnpro",
                pg_pod,
                "--",
                "psql",
                "-U",
                "postgres",
                "-d",
                "lms_api_prod",
                "-t",
                "-c",
                check_sql,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )

        bank_id = result.stdout.strip()
        if bank_id and bank_id.isdigit():
            return int(bank_id)
        # If psql returned something but not a digit, log for diagnosis
        if result.stderr:
            log(f"get_or_create_bank check stderr: {result.stderr[:2000]}", "WARN")
        if result.stdout and not bank_id:
            log(f"get_or_create_bank check stdout (no id): {result.stdout[:2000]}", "WARN")
    except Exception as e:
        log(f"get_or_create_bank check failed: {e}", "WARN")

    # Create new
    insert_sql = (
        "INSERT INTO question_banks (name, description, category, difficulty, "
        "inserted_at, updated_at)\n"
        f"VALUES ('{name}', 'Questions for {category} at {difficulty} level', "
        f"'{category}', '{difficulty}', NOW(), NOW())\n"
        "RETURNING id;"
    )

    # Retry creation in case of transient failures
    attempts = 3
    for attempt in range(1, attempts + 1):
        try:
            timeout_sec = 15 * attempt
            result = subprocess.run(
                [
                    "kubectl",
                    "exec",
                    "-n",
                    "autolearnpro",
                    pg_pod,
                    "--",
                    "psql",
                    "-U",
                    "postgres",
                    "-d",
                    "lms_api_prod",
                    "-t",
                    "-c",
                    insert_sql,
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_sec,
            )

            bank_id = result.stdout.strip()
            if bank_id and bank_id.isdigit():
                return int(bank_id)

            log(f"get_or_create_bank create attempt {attempt} failed; returncode={result.returncode}", "WARN")
            if result.stdout:
                log(f"create stdout (attempt {attempt}): {result.stdout[:2000]}", "WARN")
            if result.stderr:
                log(f"create stderr (attempt {attempt}): {result.stderr[:2000]}", "WARN")

        except subprocess.TimeoutExpired:
            log(f"get_or_create_bank create attempt {attempt} timed out after {timeout_sec}s", "WARN")
        except Exception as e:
            log(f"get_or_create_bank create exception on attempt {attempt}: {e}", "WARN")

        if attempt < attempts:
            sleep(5 * attempt)

    return None

def insert_question(question, bank_id, pg_pod):
    """Insert single question with error handling"""
    try:
        # Escape SQL
        text = question.get("question_text", "").replace("'", "''")
        topic = question.get("topic", "").replace("'", "''")
        objective = question.get("learning_objective", "").replace("'", "''")
        explanation = question.get("explanation", "").replace("'", "''")
        data_json = json.dumps(question.get("question_data", {})).replace("'", "''")

        sql = f"""INSERT INTO questions (
            question_bank_id, question_type, question_text, difficulty, topic,
            learning_objective, ase_standard, question_data, explanation,
            active, inserted_at, updated_at
        ) VALUES (
            {bank_id}, '{question['question_type']}', '{text}', '{question['difficulty']}',
            '{topic}', '{objective}', '{question.get('ase_standard', '')}',
            '{data_json}'::jsonb, '{explanation}', true, NOW(), NOW()
        );"""

        # Retry on transient failures (timeouts, brief DB load)
        attempts = 3
        for attempt in range(1, attempts + 1):
            try:
                timeout_sec = 60 * attempt if attempt <= 2 else 120
                result = subprocess.run(
                    [
                        "kubectl",
                        "exec",
                        "-n",
                        "autolearnpro",
                        pg_pod,
                        "--",
                        "psql",
                        "-U",
                        "postgres",
                        "-d",
                        "lms_api_prod",
                        "-c",
                        sql,
                    ],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=timeout_sec,
                )

                if result.returncode == 0 and "INSERT 0 1" in result.stdout:
                    return True

                log(f"Insert attempt {attempt} failed: returncode={result.returncode}", "WARN")
                if result.stdout:
                    log(f"psql stdout (attempt {attempt}): {result.stdout[:2000]}", "WARN")
                if result.stderr:
                    log(f"psql stderr (attempt {attempt}): {result.stderr[:2000]}", "WARN")

            except subprocess.TimeoutExpired:
                log(f"Insert attempt {attempt} timed out after {timeout_sec}s", "WARN")

            # Backoff before next attempt
            if attempt < attempts:
                sleep(5 * attempt)

        # All attempts failed
        return False
    except Exception as e:
        log(f"Insert error: {e}", "ERROR")
        return False

# ============================================================================
# GENERATION WITH DEFENSIVE MEASURES
# ============================================================================

def _extract_balanced(text: str, open_ch: str = "[", close_ch: str = "]") -> str:
    start = None
    depth = 0
    for i, ch in enumerate(text):
        if ch == open_ch:
            if start is None:
                start = i
            depth += 1
        elif ch == close_ch and start is not None:
            depth -= 1
            if depth == 0:
                return text[start:i+1]
    return ""


def _sanitize_and_parse(json_str: str, response: str):
    try:
        parsed = json.loads(json_str)
        return parsed if isinstance(parsed, list) else [parsed]
    except json.JSONDecodeError as e:
        cleaned = json_str
        cleaned = re.sub(r"[\x00-\x08\x0b-\x0c\x0e-\x1f]", "", cleaned)
        cleaned = re.sub(r",\s*(\}|\])", r"\1", cleaned)
        if "'" in cleaned and '"' not in cleaned:
            cleaned = cleaned.replace("'", '"')
        try:
            parsed = json.loads(cleaned)
            log("Parsed JSON after sanitization", "WARN")
            return parsed if isinstance(parsed, list) else [parsed]
        except Exception as e2:
            log(f"JSON parse error: {e} ; sanitization failed: {e2}", "ERROR")
            log(f"Raw response (truncated 2000 chars): {response[:2000]}", "ERROR")
            return None


def generate_with_ollama(prompt):
    """
    Call Ollama with HARD LIMITS and TIMEOUT
    Returns list of questions or None on failure
    """
    try:
        # Use subprocess with timeout (model already has token limits in Modelfile)
        result = subprocess.run(
            ["ollama", "run", MODEL, "--nowordwrap"],
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120  # 2 minute hard limit
        )

        if result.returncode != 0:
            log(f"Ollama failed: {result.stderr}", "ERROR")
            return None

        response = result.stdout.strip()

        # Try to extract balanced JSON
        json_str = ""
        if "[" in response:
            json_str = _extract_balanced(response, "[", "]")
        if not json_str and "{" in response:
            json_str = _extract_balanced(response, "{", "}")

        if not json_str:
            log("No JSON found in response", "WARN")
            return None

        return _sanitize_and_parse(json_str, response)
    except subprocess.TimeoutExpired:
        log("[WARN] Ollama timeout (120s) - skipping batch", "WARN")
        return None
    except KeyboardInterrupt:
        raise  # Let signal handler deal with it
    except Exception as e:
        log(f"Generation error: {e}", "ERROR")
        return None

def create_prompt(category, question_type, difficulty, ase_std):
    """Create concise prompt"""

    type_specs = {
        "multiple_choice": (
            'Format: {"options": ["A", "B", "C", "D"], "correct": 0}'
        ),
        "true_false": 'Format: {"correct": true}',
        "fill_blank": (
            'Format: {"correct_answers": ["answer1", "answer2"]}'
        ),
    }

    header = (
        f"Generate EXACTLY 1 {question_type.replace('_', ' ')} question.\n"
        f"Category: {category.replace('_', ' ').title()}\n"
        f"Difficulty: {difficulty}\n"
        f"ASE Standard: {ase_std}\n\n"
    )

    body = (
        f"{type_specs[question_type]}\n\n"
        "Requirements:\n"
        "- Technically accurate\n"
        "- Clear and concise\n"
        "- Appropriate difficulty\n"
    )

    schema = (
        f"Return ONLY JSON array: [{{'question_type': '{question_type}', "
        f"'question_text': '...', 'difficulty': '{difficulty}', 'topic': '...', "
        f"'learning_objective': '...', 'ase_standard': '{ase_std}', "
        "'question_data': {...}, 'explanation': '...'}}]"
    )

    return header + body + schema + "\n\nNO extra text. JSON only."

def _parse_json_from_response(response: str):
    """Extract and parse JSON from model response text."""
    if not response:
        return None
    try:
        if "[" in response:
            start = response.index("[")
            end = response.rindex("]") + 1
            json_str = response[start:end]
            parsed = json.loads(json_str)
            return parsed if isinstance(parsed, list) else [parsed]
        elif "{" in response:
            start = response.index("{")
            end = response.rindex("}") + 1
            json_str = response[start:end]
            parsed = json.loads(json_str)
            return [parsed]
    except Exception:
        return None

def validate_question(q: dict) -> bool:
    required = ["question_type", "question_text", "difficulty", "question_data"]
    for r in required:
        if r not in q:
            return False
    return True

# ============================================================================
# MAIN GENERATION LOOP
# ============================================================================

def calculate_batches():
    """Calculate how many of each type to generate"""
    batches = []
    total_questions = QUESTIONS_PER_RUN

    for cat, cat_pct in DISTRIBUTION["categories"].items():
        for qtype, type_pct in DISTRIBUTION["question_types"].items():
            for diff, diff_pct in DISTRIBUTION["difficulties"].items():
                count = max(1, round(total_questions * cat_pct * type_pct * diff_pct))
                batches.append({
                    "category": cat,
                    "question_type": qtype,
                    "difficulty": diff,
                    "count": count
                })

    return batches

def check_gpu_status() -> bool:
    try:
        # Prefer explicit detection first (supports Windows paths and env overrides)
        gpu_available = detect_gpu_available()
        result = subprocess.run(
            ["ollama", "ps"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
        )
        # Ollama may report GPU in its output; combine both signals
        ollama_sees_gpu = "GPU" in result.stdout
        use_gpu = bool(gpu_available or ollama_sees_gpu)
        if use_gpu:
            print("[OK] GPU acceleration ENABLED (detected)")
        else:
            print("[WARN] Running on CPU (GPU not detected)")
        return use_gpu
    except Exception:
        print("[WARN] Could not check GPU status; defaulting to CPU")
        return False

def _run_batches(batches, pg_pod):
    run_generated = 0
    run_failed = 0
    total_generated = 0

    for idx, batch in enumerate(batches, 1):
        if interrupted:
            break

        idx_str = f"[{idx}/{len(batches)}]"
        cat = batch["category"]
        qtype = batch["question_type"]
        diff = batch["difficulty"]
        count = batch["count"]
        print(f"{idx_str} {cat} | {qtype} | {diff} ({count}q)")

        bank_id = get_or_create_bank(cat, diff, pg_pod)
        if not bank_id:
            print("  [FAIL] Failed to get question bank")
            run_failed += count
            continue

        for q_num in range(count):
            if interrupted:
                break

            standards = ASE_STANDARDS[cat]
            ase_std = standards[q_num % len(standards)]
            prompt = create_prompt(cat, qtype, diff, ase_std)

            questions = generate_with_ollama(prompt)
            if not questions:
                run_failed += 1
                continue

            success = insert_question(questions[0], bank_id, pg_pod)
            if success:
                run_generated += 1
                total_generated += 1
                print(f"  [OK] Generated {run_generated}/{QUESTIONS_PER_RUN}")
            else:
                run_failed += 1

        # Save checkpoint after each batch
        progress = load_progress()
        progress["total_generated"] = total_generated
        save_progress(progress)

        if run_generated >= QUESTIONS_PER_RUN:
            break

    return run_generated, run_failed, total_generated

def main():
    global interrupted

    print("=" * 70)
    print("  GPU-ACCELERATED QUESTION GENERATION v2")
    print(f"  Model: {MODEL} | Hard limit: 200 tokens | Timeout: 120s")
    print("=" * 70)

    # Check GPU
    use_gpu = check_gpu_status()

    # Database
    pg_pod = get_postgres_pod()
    print(f"[OK] Connected to: {pg_pod}")

    # Progress
    progress = load_progress()
    total_generated = progress.get("total_generated", 0)
    progress["total_generated"] = total_generated
    print(f"Resuming: {total_generated}/{TOTAL_TARGET} completed\n")

    batches = calculate_batches()
    print(f"Generation plan: {len(batches)} batches\n")

    # Pass GPU hint to generate_with_ollama via env if needed
    if use_gpu:
        os.environ.setdefault("OLLAMA_USE_GPU", "1")
    else:
        os.environ.setdefault("OLLAMA_USE_GPU", "0")

    run_generated, run_failed, generated_now = _run_batches(batches, pg_pod)

    # Summary
    print("\n" + "=" * 70)
    print(f"Run complete: {run_generated} generated, {run_failed} failed")
    pct = 100 * generated_now / TOTAL_TARGET if TOTAL_TARGET else 0
    print(f"Total progress: {generated_now}/{TOTAL_TARGET} ({pct:.1f}%)")
    remaining_runs = (TOTAL_TARGET - generated_now) // QUESTIONS_PER_RUN
    print(f"Runs remaining: ~{remaining_runs}")
    print("=" * 70)

    if not interrupted and generated_now < TOTAL_TARGET:
        print("\n[TIP] Run again to continue:")
        print("   python scripts/generate_questions_gpu_v2.py")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\n[OK] Progress saved. Run again to resume.", "SUCCESS")
        sys.exit(0)
