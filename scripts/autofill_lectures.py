#!/usr/bin/env python3
"""Auto-fill lecture stubs using a local assistant CLI or produce prompts for manual use.

Behavior:
- Scans `content/courses/*/lectures/week-XX-lecture.md` for stubs.
- For each stub that contains the placeholder text, builds a high-quality prompt
  instructing the assistant to produce a university-level lecture (notes, examples,
  derivations, diagrams suggestions, readings, assessment questions, references).
- If the environment variable `ASSISTANT_CMD` is set, the script will run that
  command (via shell) and pipe the prompt to its stdin, capturing stdout as the
  lecture content. `ASSISTANT_CMD` should be a CLI that accepts prompt on stdin
  (examples: `ollama run qwen3`, `ollama chat qwen3`, or other local assistant wrappers).
- If `ASSISTANT_CMD` is not set or the CLI call fails, the prompt is written to
  `outputs/lecture_prompts/<course>/<week>.txt` for manual use.

Safety & quality:
- Prompts request: learning objectives, detailed lecture notes, worked examples,
  step-by-step derivations, suggested diagrams with captions, 3 assessment questions
  with short answers, slide-friendly bullet summaries,
  and instructor notes (common misconceptions, demo setup, time estimates).
- The assistant's output is saved into the lecture markdown file, replacing the
  stub. A backup of the original stub is kept as `*.bak`.

Usage:
  export ASSISTANT_CMD="ollama run qwen3"
  python scripts/autofill_lectures.py --dry-run  # only writes prompts
  python scripts/autofill_lectures.py         # attempts to call assistant

"""
from pathlib import Path
import os
import subprocess
import argparse
import textwrap
import shutil
import sys

ROOT = Path('.').resolve()
COURSES_DIR = ROOT / 'content' / 'courses'
OUT = ROOT / 'outputs'
PROMPTS_OUT = OUT / 'lecture_prompts'
RESULTS_OUT = OUT / 'lecture_results'

PROMPT_TEMPLATE = textwrap.dedent("""
You are a world-class university professor and textbook author. Produce a comprehensive,
graduate-level lecture for the following course and weekly topic. The lecture must meet or
exceed the highest university standards: clear learning objectives, rigorous explanations,
mathematical derivations where appropriate, worked examples, diagrams (describe them in
Markdown with captions), curated readings with citations (including primary literature when
available), 3 assessment questions with short answers, slide-friendly bullet summaries,
and instructor notes (common misconceptions, demo setup, time estimates).

Course: {course_title}
Week: {week_num} ({week_name})
Context: Fill and expand the stub file attached; where available, incorporate the
course-specific learning objectives (listed below) into the lecture. If course-specific
objectives are not available, produce well-justified objectives aligned to the course title.

Course-specific learning objectives (if any):
{course_objectives}

Output requirements:
- Produce Markdown content only (no HTML), suitable for saving into a file.
- Include a top-level title matching the stub heading.
- End with a short bibliography section listing sources.

Begin the lecture now.
""")


def find_stubs():
    stubs = []
    if not COURSES_DIR.exists():
        return stubs
    for course_dir in sorted(COURSES_DIR.iterdir()):
        if not course_dir.is_dir():
            continue
        lec_dir = course_dir / 'lectures'
        if not lec_dir.exists():
            continue
        for f in sorted(lec_dir.glob('week-*-lecture.md')):
            stubs.append((course_dir.name, course_dir, f))
    return stubs


def read_stub(path: Path):
    try:
        return path.read_text(encoding='utf-8')
    except Exception:
        return ''


def build_prompt(course_title, week_num, week_name, stub_text):
    # Attempt to extract any course-specific learning objectives from the course folder
    course_objectives = extract_course_learning_objectives(course_title)
    if course_objectives:
        obj_text = '\n'.join(f'- {o}' for o in course_objectives)
    else:
        obj_text = 'None provided.'
    return PROMPT_TEMPLATE.format(course_title=course_title, week_num=week_num, week_name=week_name, course_objectives=obj_text) + "\n\n" + "Stub:\n" + stub_text


def extract_course_learning_objectives(course_slug_or_title: str):
    """Search the course folder for metadata or README files containing a 'Learning Objectives' section.

    Returns a list of objective strings or empty list if none found.
    """
    # Try to find a course directory matching the slug or title
    candidates = []
    if COURSES_DIR.exists():
        for d in COURSES_DIR.iterdir():
            if not d.is_dir():
                continue
            if d.name.lower() == course_slug_or_title.lower() or course_slug_or_title.lower() in d.name.lower():
                candidates.append(d)
    # If no candidates, try fuzzy by matching words in title
    if not candidates and COURSES_DIR.exists():
        for d in COURSES_DIR.iterdir():
            if not d.is_dir():
                continue
            if any(w.lower() in d.name.lower() for w in course_slug_or_title.split()):
                candidates.append(d)

    objectives = []
    for c in candidates:
        # search common metadata filenames
        for fname in ['metadata.json', 'course.json', 'course.md', 'README.md', 'syllabus.md', 'module_model.schema.json']:
            f = c / fname
            if not f.exists():
                continue
            try:
                txt = f.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue
            # naive extraction: find 'Learning Objectives' heading and capture following bullets
            lower = txt.lower()
            if 'learning objectives' in lower:
                # find heading index
                idx = lower.find('learning objectives')
                snippet = txt[idx:idx+2000]
                # find lines starting with -, *, or numbered
                for line in snippet.splitlines()[1:50]:
                    line = line.strip()
                    if not line:
                        break
                    if line.startswith(('-', '*')) or line[0].isdigit():
                        # strip leading marker
                        cleaned = line.lstrip('-*0123456789. ').strip()
                        if cleaned:
                            objectives.append(cleaned)
                if objectives:
                    return objectives
    return objectives


def run_assistant(cmd: str, prompt: str, timeout: int = 600):
    try:
        proc = subprocess.run(cmd, input=prompt, text=True, capture_output=True, shell=True, timeout=timeout)
        if proc.returncode != 0:
            return False, proc.stdout + '\n' + proc.stderr
        return True, proc.stdout
    except FileNotFoundError as e:
        return False, str(e)
    except subprocess.TimeoutExpired as e:
        return False, f'Timeout: {e}'


def backup_file(path: Path):
    bak = path.with_suffix(path.suffix + '.bak')
    shutil.copy2(path, bak)
    return bak


def write_result(path: Path, content: str):
    path.write_text(content, encoding='utf-8')


def slug_week_from_name(name: str):
    # name like week-01-lecture.md
    parts = name.split('-')
    if len(parts) >= 2:
        try:
            return int(parts[1])
        except Exception:
            return 0
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Do not call assistant; only write prompts')
    parser.add_argument('--assistant-cmd', help='Override ASSISTANT_CMD env var for this run')
    parser.add_argument('--timeout', type=int, default=600, help='Timeout for assistant CLI (seconds)')
    args = parser.parse_args()

    assistant_cmd = args.assistant_cmd or os.environ.get('ASSISTANT_CMD')
    # If no assistant command provided, prefer ollama if available
    if not assistant_cmd:
        try:
            import shutil
            if shutil.which('ollama'):
                model = os.environ.get('OLLAMA_MODEL', 'qwen3')
                assistant_cmd = f'ollama run {model}'
        except Exception:
            pass
    PROMPTS_OUT.mkdir(parents=True, exist_ok=True)
    RESULTS_OUT.mkdir(parents=True, exist_ok=True)

    stubs = find_stubs()
    if not stubs:
        print('No lecture stubs found. Run scripts/generate_lecture_stubs.py first.')
        return

    for slug, course_dir, stub in stubs:
        course_meta_title = slug.replace('-', ' ').title()
        stub_text = read_stub(stub)
        week_num = slug_week_from_name(stub.name)
        week_name = f'Week {week_num}'

        prompt = build_prompt(course_meta_title, week_num, week_name, stub_text)

        prompt_out_dir = PROMPTS_OUT / slug
        prompt_out_dir.mkdir(parents=True, exist_ok=True)
        prompt_file = prompt_out_dir / f'{stub.stem}.txt'
        prompt_file.write_text(prompt, encoding='utf-8')

        if args.dry_run or not assistant_cmd:
            print(f'Wrote prompt for {slug}/{stub.name} to {prompt_file} (dry-run or no assistant cmd).')
            continue

        print(f'Invoking assistant for {slug}/{stub.name}...')
        ok, out = run_assistant(assistant_cmd, prompt, timeout=args.timeout)
        result_dir = RESULTS_OUT / slug
        result_dir.mkdir(parents=True, exist_ok=True)
        result_file = result_dir / f'{stub.stem}.md'
        raw_file = result_dir / f'{stub.stem}.raw.txt'

        if not ok:
            print(f'Assistant call failed for {slug}/{stub.name}: {out[:200]}')
            raw_file.write_text(out, encoding='utf-8')
            print(f'Wrote raw assistant output to {raw_file}.')
            continue

        # Backup original stub
        backup_file(stub)
        # Write assistant output into stub and result file
        write_result(stub, out)
        write_result(result_file, out)
        print(f'Wrote assistant-generated lecture to {stub} and {result_file}.')


if __name__ == '__main__':
    main()
