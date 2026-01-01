#!/usr/bin/env python3
"""
Simple 3-stage Ollama pipeline:
- Stage 1: qwen3:1.7b (draft)
- Stage 2: qwen2-math:1.5b (validate)
- Stage 3: mistral:7b (polish)

Usage: python scripts/ollama_pipeline.py --topic "Topic title"

The script will use OLLAMA_HOST env var or default to http://127.0.0.1:11435
"""
import os
import sys
import argparse
import json
from pathlib import Path

try:
    import requests
except Exception:
    print("Missing dependency 'requests'. Install with: pip install requests")
    sys.exit(1)

HOST = os.getenv('OLLAMA_HOST', 'http://127.0.0.1:11435')
# Ensure HOST includes a URL scheme so `requests` accepts it (e.g. "http://127.0.0.1:11435").
if not HOST.startswith('http://') and not HOST.startswith('https://'):
    HOST = 'http://' + HOST
API_BASE = HOST.rstrip('/') + '/api'

STAGES = [
    ('qwen3:1.7b', 'Drafting'),
    ('qwen2-math:1.5b', 'Validation'),
    ('mistral:7b', 'Polish'),
]

PROMPTS = {
    'draft': (
        "You are an instructional designer.\n\nCreate a structured lesson draft for:\n\"{topic}\"\n\nInclude:\n- Learning objectives\n- Key concepts\n- Step-by-step explanations\n- Practice questions\n\nKeep explanations concise and factual."
    ),
    'validate': (
        "You are a technical verifier.\n\nReview the lesson below for logical correctness, sequencing, and missing steps.\nRewrite ONLY where necessary to fix issues.\nDo not add fluff.\n\nLesson:\n\n{content}"
    ),
    'polish': (
        "You are an experienced technical instructor.\n\nRewrite the lesson below to be clear and engaging for beginners, well-paced and instructional, and suitable for an LMS. Add examples where helpful but do not introduce new technical concepts.\n\nLesson:\n\n{content}"
    ),
}

OUT_DIR = Path('outputs/ollama_pipeline')
OUT_DIR.mkdir(parents=True, exist_ok=True)


def generate_via_http(model: str, prompt: str) -> str:
    url = API_BASE + '/generate'
    payload = {
        'model': model,
        'prompt': prompt,
    }
    try:
        r = requests.post(url, json=payload, timeout=60)
        r.raise_for_status()
        # Try to parse JSON body for commonly returned fields
        try:
            data = r.json()
            # Ollama APIs sometimes return {'output': '...'} or {'choices': [{'content': '...'}]}
            if isinstance(data, dict):
                if 'output' in data and isinstance(data['output'], str):
                    return data['output']
                if 'choices' in data and isinstance(data['choices'], list) and data['choices']:
                    c = data['choices'][0]
                    # content might be under 'message' or 'content'
                    if isinstance(c, dict):
                        for k in ('content','message','text'):
                            if k in c and isinstance(c[k], str):
                                return c[k]
            # Fallback: return raw JSON
            return json.dumps(data, ensure_ascii=False)
        except ValueError:
            return r.text
    except Exception as e:
        raise RuntimeError(f'HTTP generation failed: {e}')


def generate_via_cli(model: str, prompt: str) -> str:
    # Fallback to CLI: pass prompt on stdin to `ollama run <model>`
    import subprocess
    ollama_exe = os.getenv('OLLAMA_EXE', r"C:\Users\rod63\AppData\Local\Programs\Ollama\ollama.exe")
    cmd = [ollama_exe, 'run', model]
    try:
        # Force UTF-8 decoding and replace invalid bytes to avoid UnicodeDecodeError
        p = subprocess.run(
            cmd,
            input=prompt,
            text=True,
            capture_output=True,
            timeout=120,
            encoding='utf-8',
            errors='replace',
        )
        if p.returncode != 0:
            stderr = p.stderr.strip() if isinstance(p.stderr, str) else str(p.stderr)
            raise RuntimeError(f'CLI failed (rc={p.returncode}): {stderr}')
        return p.stdout.strip()
    except Exception as e:
        raise RuntimeError(f'CLI generation failed: {e}')


def generate(model: str, prompt: str) -> str:
    # Try HTTP first, then CLI fallback
    try:
        return generate_via_http(model, prompt)
    except Exception as e_http:
        print(f'[warn] HTTP method failed: {e_http} — falling back to CLI', file=sys.stderr)
        try:
            return generate_via_cli(model, prompt)
        except Exception as e_cli:
            raise RuntimeError(f'Both HTTP and CLI generation failed:\nHTTP: {e_http}\nCLI: {e_cli}')


def run_pipeline(topic: str):
    # Stage 1: Draft
    draft_prompt = PROMPTS['draft'].format(topic=topic)
    print('Running Stage 1 (draft)...')
    draft = generate('qwen3:1.7b', draft_prompt)
    (OUT_DIR / '01_draft.txt').write_text(draft, encoding='utf-8')

    # Stage 2: Validate
    validate_prompt = PROMPTS['validate'].format(content=draft)
    print('Running Stage 2 (validate)...')
    validated = generate('qwen2-math:1.5b', validate_prompt)
    (OUT_DIR / '02_validated.txt').write_text(validated, encoding='utf-8')

    # Stage 3: Polish
    polish_prompt = PROMPTS['polish'].format(content=validated)
    print('Running Stage 3 (polish)...')
    polished = generate('mistral:7b', polish_prompt)
    (OUT_DIR / '03_polished.txt').write_text(polished, encoding='utf-8')

    print('\nPipeline complete. Outputs saved in:', OUT_DIR)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--topic', required=True, help='Topic to generate lesson for')
    args = ap.parse_args()
    run_pipeline(args.topic)


if __name__ == '__main__':
    main()
