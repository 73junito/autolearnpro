#!/usr/bin/env python3
"""
Test multiple strategies for getting valid JSON from Ollama model output.
Writes logs to scripts/data/logs and prints a summary.

Strategies:
 A - strict prompt to lms-assistant:latest
 B - retry wrapper to lms-assistant:latest (3 attempts, stricter on retries)
 C - strict prompt to qwen3-vl:8b
 D - dry-run placeholder (no model)

Usage:
  python scripts/test_multimodal_strategies.py --lesson-file scripts/data/lessons_small.csv
"""
import argparse
import subprocess
import json
import re
import csv
from pathlib import Path
from datetime import datetime

PROMPT_BASE = "You are a technical instructional designer. Generate multimodal lesson content for the lesson described below. Return a JSON object with keys: written_steps (markdown), audio_script (text), practice_activities (array), visual_diagrams (array)."
PROMPT_DETAILED = """
The lesson metadata:
- course: {course}
- module: {module}
- lesson_title: {title}
- lesson_type: {lesson_type}
- duration_minutes: {duration}

Requirements:
- written_steps: 6-12 numbered markdown steps with safety and verification checklist.
- audio_script: 90-180s conversational instructor script.
- practice_activities: array of 1-2 scenario objects with fields: type, title, description, questions.
- visual_diagrams: array of 0-2 diagram specs.

IMPORTANT: Output ONLY a single valid JSON object, no surrounding text, no markdown fences, no commentary.
"""

LOG_DIR = Path('scripts/data/logs')
LOG_DIR.mkdir(parents=True, exist_ok=True)


def run_ollama(model, prompt, timeout=180):
    try:
        proc = subprocess.run(["ollama", "run", model, "--nowordwrap"], input=prompt, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
        return proc.returncode, proc.stdout, (proc.stderr or '')
    except subprocess.TimeoutExpired:
        return 124, '', 'timeout'
    except FileNotFoundError:
        return 127, '', 'ollama not found'


def extract_json(text):
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            return None


def write_log(name, model, prompt, returncode, out, err, parsed):
    now = datetime.utcnow().isoformat().replace(':','-')
    p = LOG_DIR / f"{now}.{name}.{model.replace(':','_')}.log"
    with p.open('w', encoding='utf-8') as f:
        f.write('MODEL: ' + model + '\n\n')
        f.write('PROMPT:\n')
        f.write(prompt + '\n\n')
        f.write('RETURN CODE: ' + str(returncode) + '\n\n')
        f.write('STDOUT:\n')
        f.write(out or '')
        f.write('\n\n')
        f.write('STDERR:\n')
        f.write(err or '')
        f.write('\n\n')
        f.write('PARSED_JSON:\n')
        f.write(json.dumps(parsed, indent=2, ensure_ascii=False) if parsed is not None else 'None')
    return p


def strategy_A(row, model):
    prompt = PROMPT_BASE + "\n\n" + PROMPT_DETAILED.format(course=row['course_slug'], module=row['module_slug'], title=row['title'], lesson_type=row.get('lesson_type','lesson'), duration=row.get('estimated_time_minutes','0'))
    rc, out, err = run_ollama(model, prompt)
    parsed = extract_json(out or '')
    logp = write_log('A', model, prompt, rc, out, err, parsed)
    return {'name':'A','model':model,'rc':rc,'parsed':parsed,'log':str(logp)}


def strategy_B(row, model):
    # Retry wrapper: up to 3 attempts, adjust prompt each time
    base = PROMPT_DETAILED.format(course=row['course_slug'], module=row['module_slug'], title=row['title'], lesson_type=row.get('lesson_type','lesson'), duration=row.get('estimated_time_minutes','0'))
    attempts = []
    for i in range(1,4):
        if i == 1:
            prompt = PROMPT_BASE + '\n\n' + base
        else:
            prompt = "Output ONLY a valid JSON object with keys written_steps,audio_script,practice_activities,visual_diagrams. No extra text.\n\n" + base
        rc, out, err = run_ollama(model, prompt)
        parsed = extract_json(out or '')
        attempts.append({'i':i,'rc':rc,'parsed': parsed is not None})
        write_log(f'B_attempt{i}', model, prompt, rc, out, err, parsed)
        if parsed:
            return {'name':'B','model':model,'rc':rc,'parsed':parsed,'log':'multiple'}
    # failed
    return {'name':'B','model':model,'rc':rc,'parsed':None,'log':'multiple'}


def strategy_C(row, model):
    # same as A but different model
    return strategy_A(row, model)


def strategy_D(row):
    content = {
        'written_steps': 'Placeholder steps...',
        'audio_script': 'Placeholder audio script',
        'practice_activities': [],
        'visual_diagrams': []
    }
    p = LOG_DIR / f"placeholder.{row['lesson_slug']}.log"
    with p.open('w', encoding='utf-8') as f:
        f.write(json.dumps(content, indent=2))
    return {'name':'D','model':'placeholder','rc':0,'parsed':content,'log':str(p)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--lesson-file', type=Path, default=Path('scripts/data/lessons_small.csv'))
    args = parser.parse_args()

    rows = []
    with args.lesson_file.open(newline='') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    if not rows:
        print('No lessons found')
        return 2
    row = rows[0]

    results = []
    # A
    results.append(strategy_A(row, 'lms-assistant:latest'))
    # B
    results.append(strategy_B(row, 'lms-assistant:latest'))
    # C
    results.append(strategy_C(row, 'qwen3-vl:8b'))
    # D
    results.append(strategy_D(row))

    # Print summary
    print('\nSummary:')
    for r in results:
        ok = 'OK' if r['parsed'] else 'FAIL'
        print(f"Strategy {r['name']} model={r['model']} rc={r['rc']} parsed={ok} log={r['log']}")

if __name__ == '__main__':
    main()
