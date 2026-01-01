import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COURSES_JSON = ROOT / 'courses.json'
COURSES_DIR = ROOT / 'content' / 'courses'

TEMPLATE_SYLLABUS = """Syllabus — {title}
----------------------------------------

Course Overview
---------------
This course covers: {title} — core concepts, practical skills, and lab exercises.

Learning Objectives
-------------------
- Understand core concepts for {title}.
- Apply practical diagnostic or operational procedures relevant to {title}.
- Complete lab exercises and assessments demonstrating competency.

Weekly Outline
-------------
1. Introduction and safety
2. Core theory and components
3. Measurement and tools
4. System-specific operation and testing
5. Diagnostics and troubleshooting
6. Capstone lab and assessment

Assessments
-----------
- Weekly quizzes
- Two lab exercises
- Final capstone project

Prerequisites
-------------
- Basic mechanical knowledge and safety training.

"""

LESSON_TEMPLATE = """# Lesson {n} — {title} — Topic: {topic}

Objectives
- {objective1}
- {objective2}

Content
- {content}

Lab Exercise
- {lab}

Resources
- Refer to manufacturer service manuals and course resources.
"""

def load_courses():
    with open(COURSES_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)

def find_course_folder(course_id, title):
    # Try to find existing folder by id prefix
    for p in COURSES_DIR.iterdir():
        if not p.is_dir():
            continue
        name = p.name
        if name.startswith(f"{course_id:02d}-"):
            return p
    # fallback: create slug
    slug = f"{course_id:02d}-{title.lower().replace(' ', '-').replace('&','and').replace('/', '-') }"
    return COURSES_DIR / slug

def ensure_dir(p: Path):
    if not p.exists():
        p.mkdir(parents=True, exist_ok=True)

def write_if_missing(path: Path, content: str):
    if path.exists():
        return False
    path.write_text(content, encoding='utf-8')
    return True

def scaffold():
    courses = load_courses()
    created = []
    for c in courses:
        cid = c.get('id')
        title = c.get('title')
        folder = find_course_folder(cid, title)
        ensure_dir(folder)
        # README
        readme = folder / 'README.md'
        syllabus = folder / 'syllabus.md'
        lessons_dir = folder / 'lessons'
        assessments_dir = folder / 'assessments'
        ensure_dir(lessons_dir)
        ensure_dir(assessments_dir)

        write_if_missing(readme, f"# {title}\n\nCourse ID: {cid}\n\nSee syllabus.md and lessons/ for content.\n")
        write_if_missing(syllabus, TEMPLATE_SYLLABUS.format(title=title))

        # create 5 lessons
        for i in range(1,6):
            lesson_file = lessons_dir / f"{i:02d}_{title.lower().replace(' ', '_').replace('&','and').replace('/','_')}_lesson_{i}.md"
            lesson_content = LESSON_TEMPLATE.format(
                n=i,
                title=title,
                topic=f"Topic {i}",
                objective1="Explain core concepts",
                objective2="Perform practical steps",
                content="Core content goes here.",
                lab="Hands-on lab steps"
            )
            write_if_missing(lesson_file, lesson_content)

        # basic assessment
        quiz = assessments_dir / 'quiz1.json'
        labinst = assessments_dir / 'lab_instructions.md'
        write_if_missing(quiz, json.dumps({
            'quiz_id': f'quiz-{cid}',
            'title': f'{title} — Quiz 1',
            'questions': []
        }, indent=2))
        write_if_missing(labinst, f"# Lab Instructions\n\nPerform a practical lab for {title}.\n")

        created.append(str(folder))

    print('Scaffolded courses:')
    for p in created:
        print(p)

if __name__ == '__main__':
    scaffold()
