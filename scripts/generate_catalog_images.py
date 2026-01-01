#!/usr/bin/env python3
"""Generate catalog imagery via a Stable Diffusion WebUI API.

Default target: http://127.0.0.1:7860/sdapi/v1/txt2img

Usage: set `SD_API_URL` env var to point to your WebUI, then run.
Requires `requests` package.
"""
from pathlib import Path
import os
import json
import sys
import time

OUT = Path('outputs/catalog_images')
OUT.mkdir(parents=True, exist_ok=True)

def get_api_url(env_url=None):
    return env_url or os.environ.get('SD_API_URL', 'http://127.0.0.1:7860/sdapi/v1/txt2img')

def build_payload(prompt, negative_prompt=None, width=768, height=512, steps=20, cfg=7.0, samples=1, sampler='Euler a', seed=None):
    payload = {
        'prompt': prompt,
        'width': width,
        'height': height,
        'steps': steps,
        'cfg_scale': cfg,
        'sampler_name': sampler,
        'n_iter': 1,
        'batch_size': samples
    }
    if negative_prompt:
        payload['negative_prompt'] = negative_prompt
    if seed is not None:
        payload['seed'] = int(seed)
    return payload

def save_image_bytes(bts, outpath: Path):
    outpath.write_bytes(bts)

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--prompt', help='Text prompt for image generation')
    parser.add_argument('--prompts-file', help='File with one prompt per line')
    parser.add_argument('--out', help='Optional output basename', default='catalog')
    parser.add_argument('--api-url', help='SD API URL (overrides SD_API_URL env var)')
    parser.add_argument('--negative-prompt', help='Negative prompt string', default=None)
    parser.add_argument('--width', type=int, default=768)
    parser.add_argument('--height', type=int, default=512)
    parser.add_argument('--steps', type=int, default=20)
    parser.add_argument('--cfg', type=float, default=7.0)
    parser.add_argument('--samples', type=int, default=1)
    parser.add_argument('--sampler', default='Euler a')
    parser.add_argument('--seed', type=int, default=None)
    parser.add_argument('--retries', type=int, default=3)
    args = parser.parse_args()

    if not args.prompt and not args.prompts_file:
        print('Provide --prompt or --prompts-file')
        sys.exit(1)

    try:
        import requests
    except ImportError:
        print('Please install requests: pip install requests')
        sys.exit(1)

    url = get_api_url(args.api_url)

    prompts = []
    if args.prompts_file:
        pf = Path(args.prompts_file)
        if not pf.exists():
            print('Prompts file not found:', pf)
            sys.exit(2)
        prompts = [l.strip() for l in pf.read_text(encoding='utf-8').splitlines() if l.strip()]
    else:
        prompts = [args.prompt]

    headers = {'Content-Type': 'application/json'}

    import base64
    for idx, p in enumerate(prompts, start=1):
        outbase = f"{args.out}-{idx}" if len(prompts) > 1 else args.out
        payload = build_payload(p, negative_prompt=args.negative_prompt, width=args.width, height=args.height, steps=args.steps, cfg=args.cfg, samples=args.samples, sampler=args.sampler, seed=args.seed)
        attempt = 0
        resp_json = None
        while attempt <= args.retries:
            attempt += 1
            try:
                print(f'Posting to {url} (attempt {attempt})...')
                r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=600)
                if r.status_code != 200:
                    print('Error from SD API:', r.status_code, r.text)
                    if attempt > args.retries:
                        sys.exit(3)
                    else:
                        time.sleep(2 ** attempt)
                        continue
                resp_json = r.json()
                break
            except requests.exceptions.RequestException as e:
                print('Request error:', e)
                if attempt > args.retries:
                    print('Exceeded retries, aborting.')
                    sys.exit(4)
                time.sleep(2 ** attempt)

        if resp_json is None:
            print('No response from SD API')
            continue

        # Save raw response for debugging
        resp_out = OUT / f"{outbase}-resp.json"
        resp_out.write_text(json.dumps(resp_json, indent=2), encoding='utf-8')
        print('Wrote response json to', resp_out)

        images = resp_json.get('images', [])
        if not images:
            print('No images in response for prompt:', p)
            continue

        for i, b64 in enumerate(images):
            bts = base64.b64decode(b64)
            outpath = OUT / f"{outbase}-{i+1}.png"
            save_image_bytes(bts, outpath)
            print('Wrote', outpath)

if __name__ == '__main__':
    main()
