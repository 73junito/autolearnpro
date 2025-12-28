#!/usr/bin/env python3
"""Create an aggregate site index linking to each course's generated site index.

Writes `site_index/index.html` with links to `/content/courses/<slug>/site/index.html`.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COURSES_JSON = ROOT / 'courses.json'
METADATA_JSON = ROOT / 'course_metadata.json'
OUT = ROOT / 'site_index'

def slug(title, cid):
    return f"{cid:02d}-{title.lower().replace(' ', '-').replace('&','and').replace('/','-')}"

def load_courses():
    with open(COURSES_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)

def build_index():
    courses = load_courses()
    OUT.mkdir(parents=True, exist_ok=True)
    # load optional metadata overrides
    metadata = {}
    if METADATA_JSON.exists():
        try:
            import json as _json
            metadata = _json.loads(METADATA_JSON.read_text(encoding='utf-8'))
        except Exception:
            print('Warning: failed to parse', METADATA_JSON)

    # simple heuristics to group courses into program tracks
    def track_for_title(t):
        s = t.lower()
        if any(k in s for k in ('diesel', 'heavy')):
            return 'Diesel & Heavy Equipment'
        if any(k in s for k in ('electric', 'ev', 'hybrid', 'battery', 'high-voltage', 'charging')):
            return 'EV & Advanced Vehicle Technology'
        if any(k in s for k in ('virtual', 'lab', 'diagnostic')):
            return 'Virtual Labs & Diagnostics'
        if any(k in s for k in ('capstone', 'fleet', 'management')):
            return 'Capstones & Management'
        return 'Core Automotive Systems'

    def infer_metadata(t):
        s = t.lower()
        level = 'Intro'
        if any(k in s for k in ('advanced', 'advanced engine', 'capstone')):
            level = 'Advanced'
        elif any(k in s for k in ('engine performance', 'automatic', 'suspension', 'brake')):
            level = 'Intermediate'
        credential = ''
        if 'ase' in s:
            credential = 'ASE'
        elif 'capstone' in s:
            credential = 'Capstone'
        lab = 'Hands-on'
        if any(k in s for k in ('virtual', 'lab')):
            lab = 'Virtual'
        if any(k in s for k in ('capstone', 'project')):
            lab = 'Hybrid'
        return level, credential, lab

    # build course list enriched with slug and overrides
    all_slugs = []
    enriched = []
    for c in courses:
        cid = c.get('id')
        title = c.get('title')
        key = slug(title, cid)
        all_slugs.append(key)
        overrides = metadata.get(key, {})
        # allow track override via metadata
        track = overrides.get('track') or track_for_title(title)
        enriched.append({
            'id': cid,
            'title': title,
            'key': key,
            'track': track,
            'overrides': overrides,
        })

    # warn about unknown metadata keys
    unknown_keys = set(metadata.keys()) - set(all_slugs)
    if unknown_keys:
        print('Warning: metadata contains keys that do not match any course slugs:', sorted(list(unknown_keys)))

    # validate prereqs
    missing_prereqs = []
    for k, v in metadata.items():
        prereqs = v.get('prereqs', []) or []
        for p in prereqs:
            if p not in all_slugs:
                missing_prereqs.append((k, p))
    if missing_prereqs:
        print('Warning: metadata references missing prereqs:', missing_prereqs)

    # group courses
    groups = {}
    for c in enriched:
        groups.setdefault(c['track'], []).append(c)

    lines = [
        "<!doctype html>",
        "<html><head><meta charset=\"utf-8\"><title>Course Catalog</title>",
        "<link rel=\"stylesheet\" href=\"/theme/student-dashboard/style.css\">",
        "</head><body>",
        "<div class=\"sd-app\">",
        "<aside class=\"sd-side\"><div class=\"sd-side-inner\"><h2 style=\"color:#fff\">Course Catalog</h2></div></aside>",
        "<div class=\"sd-content\">",
        "<header class=\"sd-header\"><h1>Course Catalog</h1><p class=\"lead\">Browse competency-based courses aligned to industry standards.</p></header>",
        "<main class=\"sd-main\">",
        "<div class=\"catalog-controls\">",
        "<input id=\"catalog-filter\" placeholder=\"Filter courses (search title, track, level)…\" />",
        "</div>",
    ]

    # render grouped sections
    for track, items in groups.items():
        lines.append(f'<section class="track"><h2>{track}</h2><div class="tiles" data-track="{track}">')
        for c in items:
            cid = c.get('id')
            title = c.get('title')
            key = c.get('key')
            path = f"/content/courses/{slug(title,cid)}/site/index.html"
            initials = ''.join([w[0] for w in title.split()[:2]]).upper()
            overrides = c.get('overrides') or {}
            # metadata precedence: overrides first, then heuristics
            level = overrides.get('level') or infer_metadata(title)[0]
            creds = overrides.get('credentials') or ([] if not overrides else [])
            labtypes = overrides.get('labType') or ([] if not overrides else [])
            hours = overrides.get('estimatedHours')
            prereqs = overrides.get('prereqs') or []

            meta_parts = [p for p in ([level] + creds + labtypes) if p]
            meta_line = ' · '.join(meta_parts)

            # badges and chips
            cred_html = ''.join([f'<span class="chip cred">{cval}</span>' for cval in creds])
            lab_html = ''.join([f'<span class="chip lab">{l}</span>' for l in labtypes])
            hours_html = f'<span class="chip hours">{hours}h</span>' if hours else ''
            prereq_html = ''
            if prereqs:
                links = []
                for p in prereqs:
                    # link to prereq if exists
                    if p in all_slugs:
                        links.append(f'<a class="prereq" href="/content/courses/{p}/site/index.html">{p}</a>')
                    else:
                        links.append(f'<span class="prereq missing">{p}</span>')
                prereq_html = '<div class="prereqs">Prereqs: ' + ', '.join(links) + '</div>'

            safe_track = track.replace(' ', '_')
            tile = (
                f'<a class="tile" href="{path}" data-track="{safe_track}" data-level="{level}">'
                f'<div class="icon">{initials}</div>'
                f'<div class="title">{cid} — {title}</div>'
                f'<div class="badges">{cred_html}{lab_html}{hours_html}</div>'
                f'<div class="meta">{meta_line}</div>'
                f'{prereq_html}'
                f'</a>'
            )
            lines.append(tile)
        lines.append('</div></section>')

    # small client-side filter script
    lines.extend([
        "</main>",
        "</div>",
        "</div>",
        "<script>",
        "(function(){", 
        "  const input = document.getElementById('catalog-filter');",
        "  input.addEventListener('input', function(){",
        "    const q = this.value.toLowerCase();",
        "    document.querySelectorAll('.tile').forEach(t=>{",
        "      const title = t.querySelector('.title').textContent.toLowerCase();",
        "      const track = t.dataset.track.toLowerCase();",
        "      const level = (t.dataset.level||'').toLowerCase();",
        "      const cred = (t.dataset.credential||'').toLowerCase();",
        "      const ok = !q || title.includes(q) || track.includes(q) || level.includes(q) || cred.includes(q);",
        "      t.style.display = ok ? 'inline-block' : 'none';",
        "    })",
        "  })",
        "})();",
        "</script>",
        "</body></html>",
    ])
    (OUT / 'index.html').write_text('\n'.join(lines), encoding='utf-8')
    print('Wrote', OUT / 'index.html')

    # metadata coverage report
    overridden = sum(1 for k in all_slugs if k in metadata)
    total = len(all_slugs)
    report = f'Metadata overrides: {overridden}/{total} courses\n'
    report += f'Unknown metadata keys: {len(unknown_keys)}\n'
    (OUT / 'metadata_report.txt').write_text(report, encoding='utf-8')
    print('Wrote', OUT / 'metadata_report.txt')

if __name__ == '__main__':
    build_index()
