import subprocess
from pathlib import Path

SCRIPTS_DIR = Path('scripts')
OUT_DIR = Path('scripts/docs/course_pages')


def test_generator_creates_files(tmp_path):
    # Run generator with sample CSVs
    cmd = ["python", "scripts/generate_course_pages.py", "--out", str(OUT_DIR), "--force"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    assert r.returncode == 0, f"Generator failed: {r.stdout}\n{r.stderr}"

    # Check expected files for example-course
    idx = OUT_DIR / 'example-course' / 'index.md'
    mod = OUT_DIR / 'example-course' / 'modules' / 'module-1.md'
    lesson = OUT_DIR / 'example-course' / 'lessons' / 'lesson-1.md'
    assert idx.exists(), f"Missing {idx}"
    assert mod.exists(), f"Missing {mod}"
    assert lesson.exists(), f"Missing {lesson}"

    # Basic content checks
    txt = idx.read_text(encoding='utf-8')
    assert 'title:' in txt and 'code:' in txt


def test_validator_passes_strict():
    cmd = ["python", "scripts/validate_course_pages.py", str(OUT_DIR), "--strict"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    assert r.returncode == 0, f"Validator failed: {r.stdout}\n{r.stderr}"
