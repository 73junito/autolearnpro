#!/usr/bin/env python3
"""Standardize course index numbers in the database."""

import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

HERO_TEMPLATE = '''
            <div class="course-hero course-hero--compact" role="region" aria-label="Course hero" aria-labelledby="course-hero-title">
                <div class="hero-body">
                    <h3 id="course-hero-title" class="hero-title">{title}</h3>
                    <div class="hero-sub">{subtitle}</div>
                    <span class="sr-only">Course overview and quick start</span>
                </div>
                <div class="hero-cta">
                    <a class="cta-btn" href="modules/week-01-introduction/overview.html" data-start-link="modules/week-01-introduction/overview.html">Start Module 1</a>
                </div>
            </div>
'''

SIDEBAR_INNER = (
    '        <div class="nav-controls"><button class="nav-expand" aria-label="Expand all">Expand</button><button class="nav-collapse" aria-label="Collapse all">Collapse</button></div>\n'
    '        <input class="nav-search" data-nav-search autocomplete="off" placeholder="Search navigation…" aria-label="Search navigation" aria-controls="nav-root" />\n'
    '        <div id="nav-root"></div>\n'
    '        <div class="nav-no-results" hidden>No matches</div>\n'
)

# Nav-builder script copied from the reference course (keeps the same logic)
NAV_SCRIPT = r'''
<script>
document.addEventListener('DOMContentLoaded', function(){
    try{
        const sideInner = document.querySelector('.sd-side-inner');
        const navRoot = document.getElementById('nav-root');
        if(!sideInner || !navRoot) return;
        // collect anchors from sidebar or main contents
        let anchors = Array.from(sideInner.querySelectorAll('a'));
        if(!anchors.length){ anchors = Array.from(document.querySelectorAll('.sd-main a')); }
        // Group anchors so module folders (modules/<week>) become their own accordion
        const groups = {};
        function prettifyLabel(s){ return (s||'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }
        anchors.forEach(a=>{
            const href = a.getAttribute('href') || a.href || '';
            const parts = href.split('/').filter(Boolean);
            let key = parts[0] || 'misc';
            let display = key;
            if(key === 'modules' && parts[1]){ // modules/week-01-intro -> group by week
                key = `modules/${parts[1]}`;
                display = parts[1];
            }
            groups[key] = groups[key] || { display: display, items: [] };
            groups[key].items.push({ text: a.textContent.trim() || href, href });
        });

        const KEY = 'navState:' + (document.body.dataset.courseId || location.pathname);
        const saved = JSON.parse(localStorage.getItem(KEY)||'{}');

        Object.keys(groups).sort().forEach(groupName=>{
            const g = groups[groupName];
            const div = document.createElement('div'); div.className='nav-group';
            const btn = document.createElement('button'); btn.className='nav-toggle'; btn.setAttribute('aria-expanded','false'); btn.innerHTML = '<span>'+prettifyLabel(g.display)+'</span><span aria-hidden>▸</span>';
            const ul = document.createElement('ul'); ul.className='nav-list';
            g.items.forEach(item=>{
                const li = document.createElement('li');
                const link = document.createElement('a'); link.href = item.href; link.textContent = item.text;
                li.appendChild(link); ul.appendChild(li);
            });
            const expanded = !!saved[groupName];
            if(expanded){ btn.setAttribute('aria-expanded','true'); ul.classList.add('expanded'); }
            btn.addEventListener('click', function(){
                const isExpanded = this.getAttribute('aria-expanded') === 'true';
                this.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
                ul.classList.toggle('expanded', !isExpanded);
                saved[groupName] = !isExpanded;
                try{ localStorage.setItem(KEY, JSON.stringify(saved)); }catch(e){}
            });
            div.appendChild(btn); div.appendChild(ul); navRoot.appendChild(div);
        });

        const search = sideInner.querySelector('[data-nav-search]');
        const noResults = sideInner.querySelector('.nav-no-results');
        function updateNoResults(){
            const any = Array.from(navRoot.querySelectorAll('li')).some(li=> li.style.display !== 'none');
            if(noResults) noResults.hidden = any;
        }
        function debounce(fn,wait){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }
        const onSearch = debounce(function(){
            const q = (search.value||'').trim().toLowerCase();
            navRoot.querySelectorAll('.nav-list li').forEach(li=>{
                const t = li.textContent.toLowerCase();
                li.style.display = !q || t.includes(q) ? '' : 'none';
            });
            navRoot.querySelectorAll('.nav-group').forEach(g=>{
                const anyVisible = Array.from(g.querySelectorAll('li')).some(li=> li.style.display !== 'none');
                const ul = g.querySelector('.nav-list');
                const toggle = g.querySelector('.nav-toggle');
                if(anyVisible){ ul.classList.add('expanded'); toggle && toggle.setAttribute('aria-expanded','true'); } else { ul.classList.remove('expanded'); toggle && toggle.setAttribute('aria-expanded','false'); }
            });
            updateNoResults();
        },200);
        if(search) search.addEventListener('input', onSearch);

        // Expand/Collapse controls
        const expBtn = sideInner.querySelector('.nav-expand');
        const colBtn = sideInner.querySelector('.nav-collapse');
        if(expBtn){ expBtn.addEventListener('click', ()=>{ navRoot.querySelectorAll('.nav-list').forEach(u=>u.classList.add('expanded')); navRoot.querySelectorAll('.nav-toggle').forEach(b=>b.setAttribute('aria-expanded','true')); }); }
        if(colBtn){ colBtn.addEventListener('click', ()=>{ navRoot.querySelectorAll('.nav-list').forEach(u=>u.classList.remove('expanded')); navRoot.querySelectorAll('.nav-toggle').forEach(b=>b.setAttribute('aria-expanded','false')); }); }

    }catch(e){console.warn('Nav build failed',e)}
});
</script>
''' origin/main


def get_database_url():
    """Get database URL from environment variables."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL environment variable not set.")
        print("Please set it in your .env file or environment.")
        sys.exit(1)
    return database_url


def standardize_course_index():
    """Standardize course index numbers to be sequential."""
    database_url = get_database_url()

    # Create engine and session
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Get all courses ordered by current index
        courses = session.query(Course).order_by(Course.index).all()

        if not courses:
            print("No courses found in the database.")
            return

        print(f"Found {len(courses)} courses.")
        print("\n=== Current State ===")
        for course in courses:
            print(f"  Course {course.id}: index={course.index}, title={course.title}")

        # Ask for confirmation
        print("\n=== Proposed Changes ===")
        print("Will renumber courses to have sequential indexes starting from 1:")
        for i, course in enumerate(courses, 1):
            if course.index != i:
                print(f"  Course {course.id}: {course.index} -> {i}")

        response = input("\nProceed with renumbering? (yes/no): ")
        if response.lower() not in ["yes", "y"]:
            print("Operation cancelled.")
            return

        # Update indexes
        print("\nUpdating indexes...")
        for i, course in enumerate(courses, 1):
            if course.index != i:
                old_index = course.index
                course.index = i
                print(f"  Updated course {course.id}: {old_index} -> {i}")

        # Commit changes
        session.commit()
        print("\n=== Success ===")
        print("Course indexes have been standardized.")

        # Display final state
        print("\n=== Final State ===")
        courses = session.query(Course).order_by(Course.index).all()
        for course in courses:
            print(f"  Course {course.id}: index={course.index}, title={course.title}")

    except Exception as e:
        print(f"\nError: {e}")
        session.rollback()
        sys.exit(1)
    finally:
        session.close()


def add_course_indexes():
    """Add index column to courses if it doesn't exist."""
    database_url = get_database_url()

    # Create engine
    engine = create_engine(database_url)

    try:
        with engine.connect() as conn:
            # Check if index column exists
            result = conn.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'courses' AND column_name = 'index'
                """
            )

            if result.fetchone():
                print("Index column already exists.")
                return

            print("Adding index column to courses table...")

            # Add index column
            conn.execute(
                """
                ALTER TABLE courses
                ADD COLUMN index INTEGER
                """
            )

            # Set initial values based on id
            conn.execute(
                """
                UPDATE courses
                SET index = id
                """
            )

            conn.commit()
            print("Index column added successfully.")

    except Exception as e:
        print(f"Error adding index column: {e}")
        sys.exit(1)


def reset_course_indexes():
    """Reset all course indexes to match their IDs."""
    database_url = get_database_url()

    # Create engine and session
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        courses = session.query(Course).all()

        if not courses:
            print("No courses found in the database.")
            return

        print(f"Found {len(courses)} courses.")
        print("\nResetting indexes to match course IDs...")

        for course in courses:
            if course.index != course.id:
                old_index = course.index
                course.index = course.id
                print(f"  Course {course.id}: {old_index} -> {course.id}")

        session.commit()
        print("\nIndexes reset successfully.")

    except Exception as e:
        print(f"Error resetting indexes: {e}")
        session.rollback()
        sys.exit(1)
    finally:
        session.close()


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Manage course index numbers"
    )
    parser.add_argument(
        "action",
        choices=["add", "standardize", "reset"],
        help="Action to perform",
    )

    args = parser.parse_args()

    if args.action == "add":
        add_course_indexes()
    elif args.action == "standardize":
        standardize_course_index()
    elif args.action == "reset":
        reset_course_indexes()


if __name__ == "__main__":
    main()
