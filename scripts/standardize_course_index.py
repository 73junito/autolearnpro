#!/usr/bin/env python3
"""Standardize course site index.html files.

Backs up originals to `outputs/index_backups/` and updates each
`content/courses/*/site/index.html` to use the sidebar search/nav-root
and insert a `.course-hero` block in the main contents. Also appends
the nav-builder JS if missing.
"""
from pathlib import Path
import re
import shutil

ROOT = Path('content/courses')
BACKUP_ROOT = Path('outputs/index_backups')
BACKUP_ROOT.mkdir(parents=True, exist_ok=True)

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
NAV_SCRIPT = '''
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
'''


def process_index(path: Path) -> bool:
    text = path.read_text(encoding='utf-8')

    # Backup
    rel = path.relative_to(Path('.'))
    dest = BACKUP_ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)

    modified = False

    # Ensure sidebar inner replaced
    m = re.search(r'(<aside\s+class="sd-side">\s*<div\s+class="sd-side-inner">)(.*?)(</div>\s*</aside>)', text, flags=re.S)
    if m:
        inner = m.group(2)
        if 'nav-root' not in inner or 'nav-search' not in inner:
            text = text[:m.start(1)] + m.group(1) + '\n' + SIDEBAR_INNER + m.group(3) + text[m.end(3):]
            modified = True

    # Ensure course-hero exists inside main after Contents h2
    if 'class="course-hero"' not in text:
        # extract header title
        title_m = re.search(r'<header[^>]*>.*?<h1>(.*?)</h1>.*?</header>', text, flags=re.S)
        title = title_m.group(1).strip() if title_m else path.parent.name
        # try to get subtitle from meta og:description
        sub_m = re.search(r'<meta\s+property="og:description"\s+content="(.*?)"\s*/?>', text)
        subtitle = sub_m.group(1).strip() if sub_m else ''
        # insert after the first occurrence of <h2>Contents</h2>
        if '<h2>Contents</h2>' in text:
            hero_html = HERO_TEMPLATE.format(title=title, subtitle=subtitle)
            text = text.replace('<h2>Contents</h2>', '<h2>Contents</h2>\n' + hero_html, 1)
            modified = True

    # Ensure nav script exists
    if 'Nav build failed' not in text and "document.addEventListener('DOMContentLoaded'" not in text:
        # Append script before </body>
        if '</body>' in text:
            text = text.replace('</body>', NAV_SCRIPT + '\n</body>')
            modified = True

    if modified:
        path.write_text(text, encoding='utf-8')
    return modified


def main():
    files = list(ROOT.glob('*/site/index.html'))
    total = 0
    patched = 0
    for p in files:
        total += 1
        try:
            if process_index(p):
                print(f'Patched: {p}')
                patched += 1
            else:
                print(f'No change: {p}')
        except Exception as e:
            print(f'Error processing {p}: {e}')

    print(f'Found {total} index.html files, patched {patched}. Backups in {BACKUP_ROOT}')


if __name__ == '__main__':
    main()
