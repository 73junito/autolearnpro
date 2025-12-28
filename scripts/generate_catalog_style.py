#!/usr/bin/env python3
"""Generate catalog styling tokens using Ollama.

This helper prepares a design prompt (see `catalog_style_prompt.txt`) and
attempts to run `ollama` to generate a JSON-like response containing:
 - color palette (hex)
 - suggested CSS variables
 - typography + accent guidance

If `ollama` CLI is not available, the script will print the prompt and
save it to `outputs/catalog_style_prompt.txt` for manual use.
"""
from pathlib import Path
import subprocess
import os
import sys

ROOT = Path('.').resolve()
OUT = ROOT / 'outputs'
OUT.mkdir(exist_ok=True)

PROMPT_FILE = Path(__file__).parent / 'catalog_style_prompt.txt'
PROMPT_OUT = OUT / 'catalog_style_prompt.txt'
RESULT_OUT = OUT / 'catalog_style.json'

def load_prompt(course=None):
    p = PROMPT_FILE.read_text(encoding='utf-8')
    if course:
        p = p.replace('{{course}}', course)
    return p

def try_ollama(prompt, model_env='OLLAMA_MODEL'):
    # model name can be provided via env var or default to 'qwen3'
    model = os.environ.get(model_env, 'qwen3')
    # Attempt to call `ollama generate <model>` and send prompt on stdin.
    cmd = ['ollama', 'generate', model]
    try:
        proc = subprocess.run(cmd, input=prompt, text=True, capture_output=True, check=True)
        return proc.stdout
    except FileNotFoundError:
        return None
    except subprocess.CalledProcessError as e:
        print('ollama returned non-zero:', e, file=sys.stderr)
        return e.stdout or e.stderr

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--course', help='Optional course name to tailor suggestions')
    parser.add_argument('--save-only', action='store_true', help='Do not call ollama; only write prompt')
    args = parser.parse_args()

    prompt = load_prompt(args.course)
    PROMPT_OUT.write_text(prompt, encoding='utf-8')
    print('Prompt written to', PROMPT_OUT)

    if args.save_only:
        print('Skipping ollama call (save-only).')
        return

    print('Attempting to run ollama...')
    out = try_ollama(prompt)
    if out is None:
        print('ollama CLI not found. Run the prompt manually or install ollama.')
        return

    # Write raw output to results file
    RESULT_OUT.write_text(out, encoding='utf-8')
    print('Wrote ollama output to', RESULT_OUT)

if __name__ == '__main__':
    main()
