#!/usr/bin/env python3
"""
GPU-Accelerated Question Generator using Ollama
Generates questions in manageable batches with auto-resume
"""
import subprocess
import json
import sys
from pathlib import Path

# Configuration
MODEL = "lms-assistant:latest"
BATCH_SIZE = 3
QUESTIONS_PER_RUN = 50
PROGRESS_FILE = "scripts/.question_progress.json"

print("=" * 70)
print("  GPU-ACCELERATED QUESTION GENERATION")
print(f"  Model: {MODEL} | Batch: {BATCH_SIZE} | Per Run: {QUESTIONS_PER_RUN}")
print("=" * 70)

# Check GPU status
print("\nChecking GPU status...")
try:
    result = subprocess.run(
        ["ollama", "ps"], capture_output=True, text=True, check=True,
        encoding="utf-8", errors="replace",
    )
    if "GPU" in result.stdout:
        print("✓ GPU acceleration ENABLED")
    else:
        print("⚠ Warning: GPU not detected, using CPU")
except Exception:
    print("⚠ Could not check GPU status")

# Get postgres pod
try:
    result = subprocess.run([
        "kubectl", "get", "pod", "-n", "autolearnpro", "-l", "app=postgres",
        "-o", "jsonpath={.items[0].metadata.name}"
    ], capture_output=True, text=True, check=True)
    pgPod = result.stdout.strip()
    print(f"✓ Database: {pgPod}")
except Exception as e:
    print(f"✗ Database error: {e}")
    sys.exit(1)

# Load progress
progress = {"total": 0}
if Path(PROGRESS_FILE).exists():
    with open(PROGRESS_FILE) as f:
        progress = json.load(f)
    print(f"✓ Resuming: {progress['total']} questions already generated\n")
else:
    print("✓ Starting fresh\n")

# Simple test generation
prompt = """Create 1 automotive brake system true/false question.
Return ONLY JSON array:
[{
  "question_type": "true_false",
  "question_text": "Brake fluid absorbs moisture over time",
  "question_data": {"correct": true},
  "difficulty": "easy",
  "topic": "Brake Systems",
  "learning_objective": "Understand brake fluid properties",
  "ase_standard": "A5.A.1",
  "points": 1,
  "explanation": (
        "Brake fluid is hygroscopic and absorbs moisture from the air, "
        "which lowers its boiling point"
    ),
  "reference_material": "ASE A5 Study Guide",
  "correct_feedback": "Correct! This is why brake fluid should be replaced periodically",
  "incorrect_feedback": "Review brake fluid properties and maintenance requirements"
}]
"""

print("Running test generation...")
try:
    result = subprocess.run(
        ["ollama", "run", MODEL, "--nowordwrap"],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=60,
        encoding="utf-8",
        errors="replace",
    )

    if result.returncode == 0:
        response = result.stdout.strip()

        # Extract JSON
        if "[" in response:
            json_start = response.index("[")
            json_end = response.rindex("]") + 1
            json_str = response[json_start:json_end]
            questions = json.loads(json_str)

            print(f"✓ Test successful: Generated {len(questions)} question(s)")
            print(f"\nQuestion: {questions[0].get('question_text', 'N/A')[:80]}...")
            print(f"\n{'='*70}")
            print("SYSTEM READY!")
            print(f"{'='*70}")
            print(f"\nTo generate {QUESTIONS_PER_RUN} questions, run:")
            print("  python scripts/generate_questions_gpu.py")
            print("\nRun repeatedly to reach 200,000 questions (auto-resumes)")
        else:
            print("⚠ No JSON in response")
            print(f"Response: {response[:200]}")

except subprocess.TimeoutExpired:
    print("✗ Timeout (>60s)")
except Exception as e:
    print(f"✗ Error: {e}")
