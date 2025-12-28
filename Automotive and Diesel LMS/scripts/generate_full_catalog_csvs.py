#!/usr/bin/env python3
"""
Generate full catalog CSVs for course page generator.
Creates scripts/data/courses.csv, modules.csv, lessons.csv for the catalog.

Usage:
  python scripts/generate_full_catalog_csvs.py --out scripts/data --start-id 1000

This will create a full set of sample data (25 courses, 4 modules each, 3 lessons per module).
"""
import csv
import argparse
from pathlib import Path

CATALOG = [
    ("AUT-120","Brake Systems (ASE A5)"),
    ("AUT-140","Engine Performance I"),
    ("AUT-150","Electrical Systems Fundamentals"),
    ("AUT-160","Suspension & Steering"),
    ("AUT-180","Automatic Transmissions"),
    ("AUT-320","Advanced Engine Diagnostics"),
    ("AUT-340","Automotive Network Systems"),
    ("AUT-360","ADAS & Driver Assistance"),
    ("AUT-480","Fleet Management & Operations"),
    ("AUT-490","Capstone Project"),
    ("DSL-160","Diesel Engine Operation"),
    ("DSL-170","Diesel Fuel Systems"),
    ("DSL-180","Air Intake & Exhaust Systems"),
    ("DSL-360","Diesel Emissions Control"),
    ("DSL-380","Heavy Duty Truck Systems"),
    ("DSL-490","Diesel Technology Capstone"),
    ("EV-150","Electric Vehicle Fundamentals"),
    ("EV-160","Hybrid Vehicle Systems"),
    ("EV-170","EV Battery Technology"),
    ("EV-350","High-Voltage Systems Service"),
    ("EV-360","EV Charging Infrastructure"),
    ("EV-370","Advanced Battery Management"),
    ("EV-490","Electric Vehicle Capstone"),
    ("VLB-100","Virtual Lab Safety & Tools"),
    ("VLB-110","Virtual Diagnostic Procedures"),
]

MODULE_TEMPLATES = [
    ("Fundamentals", "Introduction to core concepts and safety"),
    ("Systems & Components", "Detailed study of system components and operation"),
    ("Diagnostics & Service", "Diagnostic procedures and service techniques"),
    ("Advanced Applications", "Advanced topics and real-world scenarios"),
]

LESSON_TYPES = [("lesson",45),("lesson",45),("lab",90)]


def slugify(code):
    return code.lower().replace(' ', '-').replace(':','').replace('/', '-')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=Path('scripts/data'))
    parser.add_argument('--start-id', type=int, default=1000)
    args = parser.parse_args()

    out = args.out
    out.mkdir(parents=True, exist_ok=True)

    courses_f = out / 'courses.csv'
    modules_f = out / 'modules.csv'
    lessons_f = out / 'lessons.csv'

    with courses_f.open('w', newline='', encoding='utf-8') as cf, \
         modules_f.open('w', newline='', encoding='utf-8') as mf, \
         lessons_f.open('w', newline='', encoding='utf-8') as lf:

        course_writer = csv.writer(cf)
        module_writer = csv.writer(mf)
        lesson_writer = csv.writer(lf)

        course_writer.writerow(['slug','code','title','course_id','summary','authors','tags','last_updated','published','estimated_time_minutes','credits','duration_hours','level','prerequisites','learning_objectives'])
        module_writer.writerow(['course_slug','module_slug','title','module_id','summary','sequence_number','duration_weeks','objectives'])
        lesson_writer.writerow(['course_slug','module_slug','lesson_slug','title','lesson_id','estimated_time_minutes','lesson_type','content'])

        cid = args.start_id
        mid = cid * 10
        lid = cid * 100

        for i,(code,title) in enumerate(CATALOG, start=1):
            slug = slugify(code)
            summary = f"{title} - comprehensive course covering core topics."
            authors = 'AutoLearn Team'
            tags = 'generated'
            last_updated = ''
            published = 'true'
            estimated_time = 90
            credits = 3
            duration_hours = 45
            level = 'lower_division' if i <= 15 else 'upper_division'
            prerequisites = ''
            learning_objectives = 'Objective 1;Objective 2;Objective 3'

            course_writer.writerow([slug, code, title, cid, summary, authors, tags, last_updated, published, estimated_time, credits, duration_hours, level, prerequisites, learning_objectives])

            # modules
            for m_idx, (mtitle, msummary) in enumerate(MODULE_TEMPLATES, start=1):
                mslug = f"module-{m_idx}"
                module_id = mid + m_idx
                sequence = m_idx
                duration_weeks = 2
                objectives = 'Objective A;Objective B;Objective C'
                module_writer.writerow([slug, mslug, mtitle, module_id, msummary, sequence, duration_weeks, objectives])

                # lessons
                for l_idx, (ltype, ldur) in enumerate(LESSON_TYPES, start=1):
                    lslug = f"lesson-{m_idx}-{l_idx}"
                    lesson_id = lid + (m_idx*10) + l_idx
                    title_l = f"{mtitle} - Part {l_idx}"
                    content = f"Content for {title_l}"
                    lesson_writer.writerow([slug, mslug, lslug, title_l, lesson_id, ldur, ltype, content])

            cid += 1
            mid += 100
            lid += 1000

    print(f"Wrote: {courses_f}, {modules_f}, {lessons_f}")

if __name__ == '__main__':
    main()
