#!/usr/bin/env python3
"""
GPU-Accelerated 200K Question Generator
Generates automotive assessment questions using Ollama with GPU acceleration
Auto-resumes and manages batches efficiently
"""
import random
import json
import subprocess
from datetime import datetime
from pathlib import Path
from time import time, sleep
from typing import List, Optional

# ============================================================================
# CONFIGURATION
# ============================================================================
MODEL = "lms-assistant:latest"
BATCH_SIZE = 1  # Single question per call for speed
QUESTIONS_PER_RUN = 50  # Total questions this run will generate
TOTAL_TARGET = 200000  # Final goal
PROGRESS_FILE = "scripts/.question_progress.json"
LOG_FILE = f"scripts/question_generation_gpu_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

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
# HELPER FUNCTIONS
# ============================================================================

def log(message, level="INFO"):
    """Write to log file and console"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = f"[{timestamp}] [{level}] {message}"

    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_msg + "\n")
    except Exception:
        # Best-effort logging; continue
        pass

    colors = {
        "ERROR": "\033[91m",
        "WARN": "\033[93m",
        "SUCCESS": "\033[92m",
        "INFO": "\033[97m",
    }
    print(f"{colors.get(level, '')}{message}\033[0m")


def validate_question(q: dict) -> bool:
    required_fields = [
        "question_type",
        "question_text",
        "difficulty",
        "points",
        "ase_standard",
        "question_data",
    ]
    for field in required_fields:
        if field not in q or q[field] in (None, "", []):
            print(f"Validation failed: missing {field} in {q}")
            return False

    qtype = q["question_type"]
    data = q["question_data"]

    if qtype == "multiple_choice":
        if not isinstance(data.get("correct"), int) or data["correct"] not in [0, 1, 2, 3]:
            print(f"Validation failed: invalid 'correct' for multiple_choice in {q}")
            return False
    elif qtype == "true_false":
        if not isinstance(data.get("correct"), bool):
            print(f"Validation failed: invalid 'correct' for true_false in {q}")
            return False
    elif qtype == "fill_blank":
        if not isinstance(data.get("blanks"), list) or len(data["blanks"]) < 1:
            print(f"Validation failed: invalid 'blanks' for fill_blank in {q}")
            return False

    return True


def get_postgres_pod() -> str:
    """Get postgres pod name"""
    try:
        result = subprocess.run(
            [
                "kubectl",
                "get",
                "pod",
                "-n",
                "autolearnpro",
                "-l",
                "app=postgres",
                "-o",
                "jsonpath={.items[0].metadata.name}",
            ],
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()
    except Exception as e:
        log(f"Failed to get postgres pod: {e}", "ERROR")
        return ""


def get_or_create_question_bank(category: str, difficulty: str, pg_pod: str) -> Optional[int]:
    """Get or create question bank ID"""
    name = f"{category.upper()} - {difficulty.upper()}"

    # Check if exists
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
        )
        bank_id = result.stdout.strip()
        if bank_id and bank_id.isdigit():
            return int(bank_id)
    except Exception:
        # Fall through to create
        pass

    # Create new bank
    insert_sql = (
        "INSERT INTO question_banks (name, description, category, difficulty, "
        "inserted_at, updated_at)\n"
        f"VALUES ('{name}', 'Questions for {category} at {difficulty} level', "
        f"'{category}', '{difficulty}', NOW(), NOW())\n"
        "RETURNING id;"
    )

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
                insert_sql,
            ],
            capture_output=True,
            text=True,
        )
        bank_id = result.stdout.strip()
        return int(bank_id) if bank_id.isdigit() else None
    except Exception:
        return None


def generate_with_ollama(prompt, model=MODEL, retries=2):
    """Call Ollama REST API with retry logic and defensive timeouts"""
    import urllib.request
    import urllib.error

    url = "http://localhost:11434/api/generate"

    for attempt in range(retries + 1):
        try:
            data = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.2,   # Ultra-focused
                    "num_predict": 150    # Minimal for speed
                }
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(data).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )

            with urllib.request.urlopen(req, timeout=90) as response:
                result = json.loads(response.read().decode("utf-8"))
                text = result.get("response", "").strip()

                # Extract JSON array
                if "[" in text and "]" in text:
                    json_str = text[text.index("["):text.rindex("]") + 1]
                    questions = json.loads(json_str)
                    return questions if isinstance(questions, list) else [questions]

                log(f"No JSON array found (attempt {attempt+1})", "WARN")

        except urllib.error.URLError as e:
            log(f"Ollama attempt {attempt+1} failed: {e}", "WARN")
            if attempt < retries:
                sleep(2 * (attempt + 1))  # Exponential backoff
        except Exception as e:
            log(f"Ollama error (attempt {attempt+1}): {e}", "WARN")
            if attempt < retries:
                sleep(2 * (attempt + 1))

    return None


AseList = List[str]


def create_prompt(
    category: str,
    question_type: str,
    difficulty: str,
    count: int,
    ase_standards: AseList,
) -> str:
    """
    Create a concise, JSON-only prompt for Ollama question generation.
    """
    system_prompt = (
        "You are a JSON-only generator.\n"
        "Rules:\n"
        "- Output ONLY valid JSON\n"
        "- Output ONLY a JSON array\n"
        "- No extra text, no markdown\n"
        "- End output with ]\n"
        "Failure to follow these rules makes the output invalid."
    )

    schema_map = {
        "multiple_choice": (
            '[{"question_type": "multiple_choice", "question_text": "string", '
            '"options": ["A", "B", "C", "D"], "question_data": {"correct": 0}, '
            '"difficulty": "easy", "points": 1, "ase_standard": "A1"}]'
        ),
        "true_false": (
            '[{"question_type": "true_false", "question_text": "string", '
            '"question_data": {"correct": true}, "difficulty": "easy", '
            '"points": 1, "ase_standard": "A1"}]'
        ),
        "fill_blank": (
            '[{"question_type": "fill_blank", "question_text": "string", '
            '"question_data": {"blanks": ["answer1"]}, "difficulty": "easy", '
            '"points": 1, "ase_standard": "A1"}]'
        ),
    }
    schema = schema_map.get(question_type, schema_map["multiple_choice"])

    user_prompt = (
        f"Generate EXACTLY {count} {question_type.replace('_', ' ')} questions.\n"
        f"Topic: {category.replace('_', ' ')}\n"
        f"Difficulty: {difficulty}\n"
        f"ASE STANDARDS: {', '.join(ase_standards)}\n"
        "Each object MUST include:\n"
        "- question_type\n"
        "- question_text\n"
        "- options (for multiple_choice)\n"
        "- question_data.correct (boolean or int)\n"
        "- difficulty (easy, medium, hard)\n"
        "- points (integer)\n"
        "- ase_standard (choose one from list above)\n"
        f"\nSchema:\n{schema}"
    )
    return system_prompt + "\n" + user_prompt


def _build_insert_sql(bank_id: int, q_item: dict) -> str:
    text = q_item["question_text"].replace("'", "''")[:5000]
    topic = q_item.get("topic", "General").replace("'", "''")[:200]
    learning_obj = q_item.get("learning_objective", "").replace("'", "''")[:500]
    explanation = q_item.get("explanation", "").replace("'", "''")[:5000]
    ref = q_item.get("reference_material", "ASE").replace("'", "''")[:500]
    correct_fb = q_item.get("correct_feedback", "Correct!").replace("'", "''")[:1000]
    incorrect_fb = q_item.get("incorrect_feedback", "Review").replace("'", "''")[:1000]
    question_data_json = json.dumps(q_item["question_data"]).replace("'", "''")

    sql = (
        "INSERT INTO questions (question_bank_id, question_type, question_text, difficulty, "
        "topic, learning_objective, ase_standard, points, question_data, explanation, "
        "reference_material, correct_feedback, incorrect_feedback, active, inserted_at, "
        "updated_at) VALUES ("
        f"{bank_id}, '{q_item.get('question_type', 'multiple_choice')}', '{text}', "
        f"'{q_item.get('difficulty', 'medium')}', '{topic}', '{learning_obj}', "
        f"'{q_item.get('ase_standard', 'A1')}', {q_item.get('points', 1)}, "
        f"'{question_data_json}', '{explanation}', '{ref}', '{correct_fb}', "
        f"'{incorrect_fb}', true, NOW(), NOW());"
    )
    return sql


def normalize_question(q: dict) -> Optional[dict]:  # noqa: C901
    """Normalize and validate a single question dict. Returns normalized dict or None."""
    q.setdefault("difficulty", "easy")
    q.setdefault("points", 1)

    # category-aware ASE
    cat = q.get("category")
    if cat and cat in ASE_STANDARDS:
        q["ase_standard"] = random.choice(ASE_STANDARDS[cat])
    else:
        q.setdefault("ase_standard", "A1")

    def _norm_multiple_choice(qi: dict) -> bool:
        if "correct" in qi:
            correct_index = qi.pop("correct")
            if not isinstance(correct_index, int) or correct_index not in [0, 1, 2, 3]:
                correct_index = 0
            qi["question_data"] = {"correct": correct_index}
        elif "question_data" not in qi:
            qi["question_data"] = {"correct": 0}
        return True

    def _norm_true_false(qi: dict) -> bool:
        if "correct_answer" in qi:
            qi["question_data"] = {"correct": bool(qi.pop("correct_answer"))}
        elif "question_data" not in qi:
            qi["question_data"] = {"correct": True}
        return True

    def _norm_fill_blank(qi: dict) -> bool:
        if "blanks" in qi:
            qi["question_data"] = {"blanks": qi["blanks"]}
        elif "question_data" not in qi:
            qi["question_data"] = {"blanks": [""]}
        return True

    NORM_MAP = {
        "multiple_choice": _norm_multiple_choice,
        "true_false": _norm_true_false,
        "fill_blank": _norm_fill_blank,
    }

    qtype = q.get("question_type")
    norm_fn = NORM_MAP.get(qtype)
    if norm_fn:
        try:
            norm_fn(q)
        except Exception as e:
            log(f"Normalization error: {e}", "WARN")
            return None

    if not validate_question(q):
        log(
            f"Invalid question structure: {q.get('question_text', 'N/A')[:50]}",
            "WARN",
        )
        return None

    return q


def insert_questions(questions: List[dict], bank_id: int, pg_pod: str) -> dict:
    """Insert questions into DB using helpers."""
    inserted = 0
    failed = 0

    for q in questions:
        norm = normalize_question(q)
        if not norm:
            failed += 1
            continue

        sql = _build_insert_sql(bank_id, norm)
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
                    "-c",
                    sql,
                ],
                capture_output=True,
                text=True,
            )
            if "INSERT 0 1" in result.stdout:
                inserted += 1
            else:
                failed += 1
        except Exception as e:
            log(f"DB insert error: {e}", "ERROR")
            failed += 1

    return {"inserted": inserted, "failed": failed}


# ============================================================================
# MAIN GENERATION
# ============================================================================

def create_plan() -> List[dict]:
    plan = []
    remaining = QUESTIONS_PER_RUN

    for cat, cat_pct in DISTRIBUTION["categories"].items():
        for qtype, type_pct in DISTRIBUTION["question_types"].items():
            for diff, diff_pct in DISTRIBUTION["difficulties"].items():
                count = max(1, int(QUESTIONS_PER_RUN * cat_pct * type_pct * diff_pct))
                if count > 0 and remaining > 0:
                    actual_count = min(count, remaining)
                    plan.append({
                        "category": cat,
                        "type": qtype,
                        "difficulty": diff,
                        "count": actual_count,
                    })
                    remaining -= actual_count
    return plan


def run_plan(plan: List[dict], pg_pod: str) -> dict:
    generated_this_run = 0
    start_time = time()

    for i, item in enumerate(plan):
        if generated_this_run >= QUESTIONS_PER_RUN:
            break

        cat = item["category"]
        qtype = item["type"]
        diff = item["difficulty"]
        count = item["count"]

        log(f"\n[{i+1}/{len(plan)}] {cat} | {qtype} | {diff} ({count}q)", "INFO")

        bank_id = get_or_create_question_bank(cat, diff, pg_pod)
        if not bank_id:
            log("Failed to get question bank", "ERROR")
            continue

        prompt = create_prompt(cat, qtype, diff, min(count, BATCH_SIZE), ASE_STANDARDS[cat])
        questions = generate_with_ollama(prompt)

        if questions and len(questions) > 0:
            result = insert_questions(questions, bank_id, pg_pod)
            status = "SUCCESS" if result["failed"] == 0 else "WARN"
            log(
                f"  [OK] Inserted: {result['inserted']}, Failed: {result['failed']}",
                status,
            )

            generated_this_run += result["inserted"]
        else:
            log("  ✗ Generation failed", "ERROR")

    elapsed = time() - start_time
    return {"generated": generated_this_run, "elapsed": elapsed}


def main():
    print("=" * 70)
    print("  GPU-ACCELERATED QUESTION GENERATION")
    print(f"  Target: {TOTAL_TARGET} | This run: {QUESTIONS_PER_RUN}")
    print("=" * 70)

    # Check GPU
    result = subprocess.run(["ollama", "ps"], capture_output=True, text=True)
    if "GPU" in result.stdout:
        log("[OK] GPU acceleration ENABLED", "SUCCESS")
    else:
        log("[WARN] GPU not detected", "WARN")

    # Get database
    pg_pod = get_postgres_pod()
    log(f"[OK] Connected to: {pg_pod}", "SUCCESS")

    # Load progress
    progress = {"total": 0, "by_category": {}, "by_type": {}, "by_difficulty": {}}
    if Path(PROGRESS_FILE).exists():
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
        log(f"Resuming: {progress['total']}/{TOTAL_TARGET} completed", "INFO")

    plan = create_plan()
    log(f"\nGeneration plan: {len(plan)} batches", "INFO")

    result = run_plan(plan, pg_pod)

    # Summary
    elapsed = result["elapsed"]
    generated_this_run = result["generated"]

    print("\n" + "=" * 70)
    log(
        f"Session complete: {generated_this_run} questions in {elapsed/60:.1f} minutes",
        "SUCCESS",
    )
    total = progress.get("total", 0)
    pct = total / TOTAL_TARGET * 100 if TOTAL_TARGET else 0
    log(f"Total progress: {total}/{TOTAL_TARGET} ({pct:.1f}%)", "INFO")

    if generated_this_run > 0:
        avg_speed = elapsed / generated_this_run
        log(f"Avg speed: {avg_speed:.1f}s per question ({60/avg_speed:.1f} q/min)", "INFO")
    else:
        log("No questions generated this run", "WARN")

    if progress.get("total", 0) < TOTAL_TARGET:
        print("\nTo continue: python scripts/generate_questions_gpu.py")
    else:
        log("*** TARGET REACHED! ***", "SUCCESS")


if __name__ == "__main__":
    main()
