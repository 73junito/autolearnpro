import json
import subprocess
from pathlib import Path
import shutil
import time

ROOT = Path(__file__).resolve().parents[1]
COURSES_JSON = ROOT / 'courses.json'
COURSES_DIR = ROOT / 'content' / 'courses'
OUTPUT_DIR = ROOT / 'outputs' / 'ollama_pipeline'

def load_courses():
    with open(COURSES_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)

def slug_for_course(title, cid):
    return f"{cid:02d}-{title.lower().replace(' ', '-').replace('&','and').replace('/','-')}"

def run_pipeline_for(title):
    cmd = ['python', str(ROOT / 'scripts' / 'ollama_pipeline.py'), '--topic', title]
    print('Running:', ' '.join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    print('Exit', proc.returncode)
    if proc.stdout:
        print(proc.stdout[:2000])
    if proc.stderr:
        print('ERR:', proc.stderr[:2000])
    return proc.returncode == 0

def move_outputs_to_course(cid, title):
    slug = slug_for_course(title, cid)
    course_folder = COURSES_DIR / slug
    gen = course_folder / 'generated'
    gen.mkdir(parents=True, exist_ok=True)
    if not OUTPUT_DIR.exists():
        print('No pipeline outputs to move for', title)
        return False
    moved = 0
    for f in OUTPUT_DIR.iterdir():
        if f.is_file():
            dest = gen / f.name
            # overwrite if exists
            shutil.move(str(f), str(dest))
            moved += 1
    return moved

def already_refined(cid, title):
    slug = slug_for_course(title, cid)
    course_folder = COURSES_DIR / slug
    gen = course_folder / 'generated'
    return gen.exists() and any(gen.iterdir())

def main():
    courses = load_courses()
    total = len(courses)
    print(f'Starting refine for {total} courses')
    for i, c in enumerate(courses, start=1):
        cid = c.get('id')
        title = c.get('title')
        print(f'[{i}/{total}] {cid} — {title}')
        if already_refined(cid, title):
            print('  Skipping — already has generated content')
            continue
        ok = run_pipeline_for(title)
        if not ok:
            print('  Pipeline failed for', title)
            # wait briefly and continue
            time.sleep(2)
            continue
        moved = move_outputs_to_course(cid, title)
        print(f'  Moved {moved} files into course generated/ folder')
        # small pause to avoid spamming the server
        time.sleep(1)

if __name__ == '__main__':
    main()
