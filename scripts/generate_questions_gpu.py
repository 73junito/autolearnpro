#!/usr/bin/env python3
"""
GPU-Accelerated 200K Question Generator
Generates automotive assessment questions using Ollama with GPU acceleration
Auto-resumes and manages batches efficiently
"""
import random
import json
import subprocess
import sys
import re
from datetime import datetime
from pathlib import Path
from time import time, sleep

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
        "brakes": 0.15
    },
    "question_types": {
        "multiple_choice": 0.40,
        "true_false": 0.35,
        "fill_blank": 0.25
    },
    "difficulties": {
        "easy": 0.30,
        "medium": 0.50,
        "hard": 0.20
    }
}

ASE_STANDARDS = {
    "ev": ["L3.A.1", "L3.A.2", "L3.A.3", "L3.B.1", "L3.B.2", "L3.C.1"],
    "diesel": ["T2.A.1", "T2.A.2", "T2.B.1", "T2.C.1", "T2.D.1", "T2.E.1"],
    "engine_performance": ["A8.A.1", "A8.A.2", "A8.B.1", "A8.C.1", "A8.D.1", "A8.E.1"],
    "brakes": ["A5.A.1", "A5.A.2", "A5.B.1", "A5.C.1", "A5.D.1", "A5.E.1"],
    "electrical": ["A6.A.1", "A6.A.2", "A6.B.1", "A6.C.1", "A6.D.1", "A6.E.1"]
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def log(message, level="INFO"):
    """Write to log file and console"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = f"[{timestamp}] [{level}] {message}"
    
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(log_msg + "\n")
    
    colors = {"ERROR": "\033[91m", "WARN": "\033[93m", "SUCCESS": "\033[92m", "INFO": "\033[97m"}
    print(f"{colors.get(level, '')}{message}\033[0m")

def validate_question(q):
    required_fields = ["question_type", "question_text", "difficulty", "points", "ase_standard", "question_data"]
    for field in required_fields:
        if field not in q or q[field] in (None, "", []):
            print(f"Validation failed: missing {field} in {q}")
            return False

    qtype = q["question_type"]
    data = q["question_data"]

    if qtype == "multiple_choice":
        if not isinstance(data.get('correct'), int) or data['correct'] not in [0,1,2,3]:
            print(f"Validation failed: invalid 'correct' for multiple_choice in {q}")
            return False
    elif qtype == "true_false":
        if not isinstance(data.get('correct'), bool):
            print(f"Validation failed: invalid 'correct' for true_false in {q}")
            return False
    elif qtype == "fill_blank":
        if not isinstance(data.get('blanks'), list) or len(data['blanks']) < 1:
            print(f"Validation failed: invalid 'blanks' for fill_blank in {q}")
            return False

    return True

def get_postgres_pod():
    """Get postgres pod name"""
    result = subprocess.run([
        "kubectl", "get", "pod", "-n", "autolearnpro", "-l", "app=postgres",
        "-o", "jsonpath={.items[0].metadata.name}"
    ], capture_output=True, text=True)
    return result.stdout.strip()

def get_or_create_question_bank(category, difficulty, pg_pod):
    """Get or create question bank ID"""
    name = f"{category.upper()} - {difficulty.upper()}"
    
    # Check if exists
    check_sql = f"SELECT id FROM question_banks WHERE name = '{name}' LIMIT 1;"
    result = subprocess.run([
        "kubectl", "exec", "-n", "autolearnpro", pg_pod, "--",
        "psql", "-U", "postgres", "-d", "lms_api_prod", "-t", "-c", check_sql
    ], capture_output=True, text=True)
    
    bank_id = result.stdout.strip()
    if bank_id and bank_id.isdigit():
        return int(bank_id)
    
    # Create new bank
    insert_sql = f"""INSERT INTO question_banks (name, description, category, difficulty, inserted_at, updated_at)
VALUES ('{name}', 'Questions for {category} at {difficulty} level', '{category}', '{difficulty}', NOW(), NOW())
RETURNING id;"""
    
    result = subprocess.run([
        "kubectl", "exec", "-n", "autolearnpro", pg_pod, "--",
        "psql", "-U", "postgres", "-d", "lms_api_prod", "-t", "-c", insert_sql
    ], capture_output=True, text=True)
    
    bank_id = result.stdout.strip()
    return int(bank_id) if bank_id.isdigit() else None

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
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            with urllib.request.urlopen(req, timeout=90) as response:
                result = json.loads(response.read().decode('utf-8'))
                text = result.get('response', '').strip()
                
                # Extract JSON array
                if '[' in text and ']' in text:
                    json_str = text[text.index('['):text.rindex(']') + 1]
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


def create_prompt(category, question_type, difficulty, count, ase_standards):
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
        "multiple_choice": '[{"question_type": "multiple_choice", "question_text": "string", "options": ["A", "B", "C", "D"], "question_data": {"correct": 0}, "difficulty": "easy", "points": 1, "ase_standard": "A1"}]',
        "true_false": '[{"question_type": "true_false", "question_text": "string", "question_data": {"correct": true}, "difficulty": "easy", "points": 1, "ase_standard": "A1"}]',
        "fill_blank": '[{"question_type": "fill_blank", "question_text": "string", "question_data": {"blanks": ["answer1"]}, "difficulty": "easy", "points": 1, "ase_standard": "A1"}]'
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
    
def insert_questions(questions, bank_id, pg_pod):
    """Insert questions into database with robust validation and category-aware ASE standard selection"""
    inserted = 0
    failed = 0
    for q in questions:
        # Auto-fill missing fields
        q.setdefault("difficulty", "easy")
        q.setdefault("points", 1)
        # Use category-aware ASE standard
        cat = q.get("category")
        if cat and cat in ASE_STANDARDS:
            q["ase_standard"] = random.choice(ASE_STANDARDS[cat])
        else:
            q.setdefault("ase_standard", "A1")

        # Ensure question_data is present and type-correct
        if q.get("question_type") == "multiple_choice":
            if "correct" in q:
                correct_index = q.pop("correct")
                if not isinstance(correct_index, int) or correct_index not in [0,1,2,3]:
                    correct_index = 0
                q["question_data"] = {"correct": correct_index}
            elif "question_data" not in q:
                q["question_data"] = {"correct": 0}
        elif q.get("question_type") == "true_false":
            if "correct_answer" in q:
                q["question_data"] = {"correct": bool(q.pop("correct_answer"))}
            elif "question_data" not in q:
                q["question_data"] = {"correct": True}
        elif q.get("question_type") == "fill_blank":
            if "blanks" in q:
                q["question_data"] = {"blanks": q["blanks"]}
            elif "question_data" not in q:
                q["question_data"] = {"blanks": [""]}

        # Schema validation
        if not validate_question(q):
            log(f"Invalid question structure: {q.get('question_text', 'N/A')[:50]}", "WARN")
            failed += 1
            continue

        # Escape and truncate
        text = q['question_text'].replace("'", "''")[:5000]
        topic = q.get('topic', 'General').replace("'", "''")[:200]
        learning_obj = q.get('learning_objective', '').replace("'", "''")[:500]
        explanation = q.get('explanation', '').replace("'", "''")[:5000]
        ref = q.get('reference_material', 'ASE').replace("'", "''")[:500]
        correct_fb = q.get('correct_feedback', 'Correct!').replace("'", "''")[:1000]
        incorrect_fb = q.get('incorrect_feedback', 'Review').replace("'", "''")[:1000]

        question_data_json = json.dumps(q['question_data']).replace("'", "''")

        sql = f"""INSERT INTO questions (
    question_bank_id, question_type, question_text, difficulty,
    topic, learning_objective, ase_standard, points,
    question_data, explanation, reference_material,
    correct_feedback, incorrect_feedback, active, inserted_at, updated_at
) VALUES (
    {bank_id}, '{q.get('question_type', 'multiple_choice')}', '{text}', '{q.get('difficulty', 'medium')}',
    '{topic}', '{learning_obj}', '{q.get('ase_standard', 'A1')}', {q.get('points', 1)},
    '{question_data_json}', '{explanation}', '{ref}',
    '{correct_fb}', '{incorrect_fb}', true, NOW(), NOW()
);
"""

        result = subprocess.run([
            "kubectl", "exec", "-n", "autolearnpro", pg_pod, "--",
            "psql", "-U", "postgres", "-d", "lms_api_prod", "-c", sql
        ], capture_output=True, text=True)

        if "INSERT 0 1" in result.stdout:
            inserted += 1
        else:
            failed += 1
    return {"inserted": inserted, "failed": failed}

# ============================================================================
# MAIN GENERATION
# ============================================================================

def main():
    print("=" * 70)
    print(f"  GPU-ACCELERATED QUESTION GENERATION")
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
    
    # Create generation plan
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
                        "count": actual_count
                    })
                    remaining -= actual_count
    
    log(f"\nGeneration plan: {len(plan)} batches", "INFO")
    
    # Generate questions
    generated_this_run = 0
    start_time = time()
    
    for i, item in enumerate(plan):
        if generated_this_run >= QUESTIONS_PER_RUN:
            break
        
        cat, qtype, diff, count = item["category"], item["type"], item["difficulty"], item["count"]
        
        log(f"\n[{i+1}/{len(plan)}] {cat} | {qtype} | {diff} ({count}q)", "INFO")
        
        # Get question bank
        bank_id = get_or_create_question_bank(cat, diff, pg_pod)
        if not bank_id:
            log("Failed to get question bank", "ERROR")
            continue
        
        # Generate with Ollama
        prompt = create_prompt(cat, qtype, diff, min(count, BATCH_SIZE), ASE_STANDARDS[cat])
        questions = generate_with_ollama(prompt)
        
        if questions and len(questions) > 0:
            # Insert into database
            result = insert_questions(questions, bank_id, pg_pod)
            log(f"  [OK] Inserted: {result['inserted']}, Failed: {result['failed']}", "SUCCESS" if result['failed'] == 0 else "WARN")
            
            generated_this_run += result['inserted']
            progress['total'] += result['inserted']
            
            # Update progress tracking
            progress['by_category'][cat] = progress['by_category'].get(cat, 0) + result['inserted']
            progress['by_type'][qtype] = progress['by_type'].get(qtype, 0) + result['inserted']
            progress['by_difficulty'][diff] = progress['by_difficulty'].get(diff, 0) + result['inserted']
            
            # Save progress
            with open(PROGRESS_FILE, 'w') as f:
                json.dump(progress, f, indent=2)
        else:
            log(f"  ✗ Generation failed", "ERROR")
    
    # Summary
    elapsed = time() - start_time
    print("\n" + "=" * 70)
    log(f"Session complete: {generated_this_run} questions in {elapsed/60:.1f} minutes", "SUCCESS")
    log(f"Total progress: {progress['total']}/{TOTAL_TARGET} ({progress['total']/TOTAL_TARGET*100:.1f}%)", "INFO")
    
    if generated_this_run > 0:
        avg_speed = elapsed / generated_this_run
        log(f"Avg speed: {avg_speed:.1f}s per question ({60/avg_speed:.1f} q/min)", "INFO")
    else:
        log("No questions generated this run", "WARN")
    
    if progress['total'] < TOTAL_TARGET:
        print("\nTo continue: python scripts/generate_questions_gpu.py")
    else:
        log("*** TARGET REACHED! ***", "SUCCESS")

if __name__ == "__main__":
    main()
