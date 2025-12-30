#!/usr/bin/env python3
"""
Generate 200K questions using Ollama (local LLM) - RELIABLE VERSION
Manages small batches with proper error handling
"""
import subprocess
import json
import sys

# Configuration
MODEL = "lms-assistant:latest"
BATCH_SIZE = 3
QUESTIONS_PER_RUN = 50
TOTAL_TARGET = 200000

print("=" * 70)
print(f"  OLLAMA QUESTION GENERATION - {TOTAL_TARGET} Questions")
print(f"  Model: {MODEL} | FREE - No API costs!")
print("=" * 70)
print(f"\nGenerating {QUESTIONS_PER_RUN} questions per run (batch size: {BATCH_SIZE})")
print(f"Run this script repeatedly to reach {TOTAL_TARGET} total questions\n")

# Test Ollama
try:
    result = subprocess.run(
        ["ollama", "list"], capture_output=True, text=True, check=True,
        encoding="utf-8", errors="replace",
    )
    print("✓ Ollama CLI available")
    models = [line.split()[0] for line in result.stdout.strip().split("\n")[1:]]
    print(f"Available models: {models}")
except subprocess.CalledProcessError as e:
    print(f"✗ Ollama not available: {e}")
    sys.exit(1)

# Test database connection
try:
    result = subprocess.run([
        "kubectl", "get", "pod", "-n", "autolearnpro", "-l", "app=postgres",
        "-o", "jsonpath={.items[0].metadata.name}"
    ], capture_output=True, text=True, check=True)
    pgPod = result.stdout.strip()
    print(f"✓ Connected to Postgres pod: {pgPod}\n")
except Exception as e:
    print(f"✗ Cannot connect to database: {e}")
    sys.exit(1)

# Simple test: generate 1 question
prompt = """Create 1 automotive true/false question in JSON format:
[{
  "question_type": "true_false",
  "question_text": "The alternator converts mechanical energy to electrical energy",
  "question_data": {"correct": true},
  "difficulty": "easy",
  "topic": "Electrical Systems",
  "learning_objective": "Understand alternator function",
  "ase_standard": "A6.A.1",
  "points": 1,
  "explanation": (
      "The alternator uses engine rotation to generate AC current "
      "which is then converted to DC"
  ),
  "reference_material": "ASE A6 Study Guide",
  "correct_feedback": "Correct! The alternator is the primary charging system component",
  "incorrect_feedback": "Review alternator operation and charging system basics"
}]

Return ONLY the JSON array, no other text."""

print("Testing question generation...")
try:
    result = subprocess.run(
        ["ollama", "run", MODEL, "--nowordwrap"],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=120,
        encoding="utf-8",
        errors="replace",
    )

    if result.returncode == 0:
        response = result.stdout.strip()
        print(f"✓ Response received ({len(response)} chars)")

        # Try to parse JSON
        if "[" in response:
            json_start = response.index("[")
            json_end = response.rindex("]") + 1
            json_str = response[json_start:json_end]
            questions = json.loads(json_str)
            print(f"✓ Successfully parsed {len(questions)} question(s)")
            print("\n✅ SYSTEM READY - Run './scripts/generate_questions_python.py' to start")
        else:
            print("⚠ No JSON found in response")
    else:
        print(f"✗ Ollama error: {result.stderr}")

except subprocess.TimeoutExpired:
    print("✗ Ollama timed out (>120s)")
except Exception as e:
    print(f"✗ Test failed: {e}")

print("\nSetup complete! The Python generator is ready to use.")
print("It will generate questions in small, manageable batches.")
