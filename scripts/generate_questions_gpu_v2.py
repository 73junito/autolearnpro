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
from datetime import datetime
from pathlib import Path
from time import time

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
    "categories": {"ev": 0.25, "diesel": 0.20, "engine_performance": 0.20, "electrical": 0.20, "brakes": 0.15},
    "question_types": {"multiple_choice": 0.40, "true_false": 0.35, "fill_blank": 0.25},
    "difficulties": {"easy": 0.30, "medium": 0.50, "hard": 0.20}
}

ASE_STANDARDS = {
    "ev": ["L3.A.1", "L3.A.2", "L3.A.3", "L3.B.1", "L3.B.2", "L3.C.1"],
    "diesel": ["T2.A.1", "T2.A.2", "T2.B.1", "T2.C.1", "T2.D.1", "T2.E.1"],
    "engine_performance": ["A8.A.1", "A8.A.2", "A8.B.1", "A8.C.1", "A8.D.1", "A8.E.1"],
    "brakes": ["A5.A.1", "A5.A.2", "A5.B.1", "A5.C.1", "A5.D.1", "A5.E.1"],
    "electrical": ["A6.A.1", "A6.A.2", "A6.B.1", "A6.C.1", "A6.D.1", "A6.E.1"]
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
    except:
        pass
    
    colors = {"ERROR": "\033[91m", "WARN": "\033[93m", "SUCCESS": "\033[92m", "INFO": "\033[0m"}
    print(f"{colors.get(level, '')}{message}\033[0m")

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
        ], capture_output=True, text=True, timeout=10)
        pod = result.stdout.strip()
        if pod:
            return pod
    except:
        pass
    log("Failed to find postgres pod", "ERROR")
    sys.exit(1)

def get_or_create_bank(category, difficulty, pg_pod):
    """Get or create question bank"""
    name = f"{category.upper()} - {difficulty.upper()}"
    
    # Check existing
    check_sql = f"SELECT id FROM question_banks WHERE name = '{name}' LIMIT 1;"
    try:
        result = subprocess.run([
            "kubectl", "exec", "-n", "autolearnpro", pg_pod, "--",
            "psql", "-U", "postgres", "-d", "lms_api_prod", "-t", "-c", check_sql
        ], capture_output=True, text=True, timeout=10)
        
        bank_id = result.stdout.strip()
        if bank_id and bank_id.isdigit():
            return int(bank_id)
    except:
        pass
    
    # Create new
    insert_sql = f"""INSERT INTO question_banks (name, description, category, difficulty, inserted_at, updated_at)
VALUES ('{name}', 'Questions for {category} at {difficulty} level', '{category}', '{difficulty}', NOW(), NOW())
RETURNING id;"""
    
    try:
        result = subprocess.run([
            "kubectl", "exec", "-n", "autolearnpro", pg_pod, "--",
            "psql", "-U", "postgres", "-d", "lms_api_prod", "-t", "-c", insert_sql
        ], capture_output=True, text=True, timeout=10)
        
        bank_id = result.stdout.strip()
        return int(bank_id) if bank_id.isdigit() else None
    except:
        return None

def insert_question(question, bank_id, pg_pod):
    """Insert single question with error handling"""
    try:
        # Escape SQL
        text = question.get('question_text', '').replace("'", "''")
        topic = question.get('topic', '').replace("'", "''")
        objective = question.get('learning_objective', '').replace("'", "''")
        explanation = question.get('explanation', '').replace("'", "''")
        data_json = json.dumps(question.get('question_data', {})).replace("'", "''")
        
        sql = f"""INSERT INTO questions (
            question_bank_id, question_type, question_text, difficulty, topic,
            learning_objective, ase_standard, question_data, explanation,
            active, inserted_at, updated_at
        ) VALUES (
            {bank_id}, '{question['question_type']}', '{text}', '{question['difficulty']}',
            '{topic}', '{objective}', '{question.get('ase_standard', '')}',
            '{data_json}'::jsonb, '{explanation}', true, NOW(), NOW()
        );"""
        
        result = subprocess.run([
            "kubectl", "exec", "-n", "autolearnpro", pg_pod, "--",
            "psql", "-U", "postgres", "-d", "lms_api_prod", "-c", sql
        ], capture_output=True, text=True, timeout=15)
        
        return result.returncode == 0
    except Exception as e:
        log(f"Insert error: {e}", "ERROR")
        return False

# ============================================================================
# GENERATION WITH DEFENSIVE MEASURES
# ============================================================================

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
            timeout=120  # 2 minute hard limit
        )
        
        if result.returncode != 0:
            log(f"Ollama failed: {result.stderr}", "ERROR")
            return None
        
        response = result.stdout.strip()
        
        # Extract JSON (handle both array and object)
        if '{' in response:
            # Find JSON boundaries
            if '[' in response and response.index('[') < response.index('{'):
                # Array format
                json_start = response.index('[')
                json_end = response.rindex(']') + 1
            else:
                # Object format - wrap in array
                json_start = response.index('{')
                json_end = response.rindex('}') + 1
            
            json_str = response[json_start:json_end]
            
            try:
                parsed = json.loads(json_str)
                # Ensure it's a list
                questions = parsed if isinstance(parsed, list) else [parsed]
                return questions
            except json.JSONDecodeError as e:
                log(f"JSON parse error: {e}", "ERROR")
                return None
        
        log("No JSON found in response", "WARN")
        return None
        
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
        "multiple_choice": 'Format: {"options": ["A", "B", "C", "D"], "correct": 0}',
        "true_false": 'Format: {"correct": true}',
        "fill_blank": 'Format: {"correct_answers": ["answer1", "answer2"]}'
    }
    
    return f"""Generate EXACTLY 1 {question_type.replace('_', ' ')} question.
Category: {category.replace('_', ' ').title()}
Difficulty: {difficulty}
ASE Standard: {ase_std}

{type_specs[question_type]}

Requirements:
- Technically accurate
- Clear and concise
- Appropriate difficulty
- Return ONLY JSON array: [{{"question_type": "{question_type}", "question_text": "...", "difficulty": "{difficulty}", "topic": "...", "learning_objective": "...", "ase_standard": "{ase_std}", "question_data": {{...}}, "explanation": "..."}}]

NO extra text. JSON only."""

def _parse_json_from_response(response: str):
    """Extract and parse JSON from model response text."""
    if not response:
        return None
    try:
        if '[' in response:
            start = response.index('[')
            end = response.rindex(']') + 1
            json_str = response[start:end]
            parsed = json.loads(json_str)
            return parsed if isinstance(parsed, list) else [parsed]
        elif '{' in response:
            start = response.index('{')
            end = response.rindex('}') + 1
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

def main():
    global interrupted
    
    print("=" * 70)
    print("  GPU-ACCELERATED QUESTION GENERATION v2")
    print(f"  Model: {MODEL} | Hard limit: 200 tokens | Timeout: 120s")
    print("=" * 70)
    
    # Check GPU
    try:
        result = subprocess.run(["ollama", "ps"], capture_output=True, text=True, timeout=5)
        if "GPU" in result.stdout:
            print("[OK] GPU acceleration ENABLED")
        else:
            print("[WARN] Running on CPU")
    except:
        print("[WARN] Could not check GPU status")
    
    # Database
    pg_pod = get_postgres_pod()
    print(f"[OK] Connected to: {pg_pod}")
    
    # Progress
    progress = load_progress()
    # Support legacy progress files that may use 'total' key
    total_generated = progress.get("total_generated", progress.get("total", 0))
    # Ensure progress dict uses canonical key for future runs
    progress["total_generated"] = total_generated
    print(f"Resuming: {total_generated}/{TOTAL_TARGET} completed\n")
    
    # Generate batches
    batches = calculate_batches()
    print(f"Generation plan: {len(batches)} batches\n")
    
    run_generated = 0
    run_failed = 0
    
    for idx, batch in enumerate(batches, 1):
        if interrupted:
            break
        
        print(f"[{idx}/{len(batches)}] {batch['category']} | {batch['question_type']} | {batch['difficulty']} ({batch['count']}q)")
        
        # Get bank ID
        bank_id = get_or_create_bank(batch['category'], batch['difficulty'], pg_pod)
        if not bank_id:
            print("  [FAIL] Failed to get question bank")
            run_failed += batch['count']
            continue
        
        # Generate each question individually (safer)
        for q_num in range(batch['count']):
            if interrupted:
                break
            
            ase_std = ASE_STANDARDS[batch['category']][q_num % len(ASE_STANDARDS[batch['category']])]
            prompt = create_prompt(batch['category'], batch['question_type'], batch['difficulty'], ase_std)
            
            # Call Ollama with defensive measures
            questions = generate_with_ollama(prompt)
            
            if not questions:
                run_failed += 1
                continue
            
            # Insert
            success = insert_question(questions[0], bank_id, pg_pod)
            if success:
                run_generated += 1
                total_generated += 1
                print(f"  [OK] Generated {run_generated}/{QUESTIONS_PER_RUN}")
            else:
                run_failed += 1
        
        # Save checkpoint after each batch
        progress["total_generated"] = total_generated
        save_progress(progress)
        
        if run_generated >= QUESTIONS_PER_RUN:
            break
    
    # Summary
    print("\n" + "=" * 70)
    print(f"Run complete: {run_generated} generated, {run_failed} failed")
    print(f"Total progress: {total_generated}/{TOTAL_TARGET} ({100*total_generated/TOTAL_TARGET:.1f}%)")
    print(f"Runs remaining: ~{(TOTAL_TARGET-total_generated)//QUESTIONS_PER_RUN}")
    print("=" * 70)
    
    if not interrupted and total_generated < TOTAL_TARGET:
        print("\n[TIP] Run again to continue:")
        print("   python scripts/generate_questions_gpu_v2.py")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\n[OK] Progress saved. Run again to resume.", "SUCCESS")
        sys.exit(0)
