from pathlib import Path
import markdown

COURSE = Path('content/courses/03-electrical-systems-fundamentals/generated')
OUT = Path('site_index')
OUT.mkdir(parents=True, exist_ok=True)

FILES = [
    'module1_overview.md',
    'module1_lesson1.md',
    'module1_lesson2.md',
    'module1_lab.md',
    'module1_quiz.md',
]

parts = []
for fname in FILES:
    p = COURSE / fname
    if not p.exists():
        parts.append(f'<section class="page"><h2>{fname} (missing)</h2><p>File not found.</p></section>')
        continue
    text = p.read_text(encoding='utf-8')
    # derive title from first heading if present
    title = None
    for ln in text.splitlines():
        if ln.strip().startswith('#'):
            title = ln.strip().lstrip('#').strip()
            break
    if not title:
        title = fname
    html = markdown.markdown(text, extensions=['fenced_code','tables'])
    parts.append(f'<section class="page"><h2>{title}</h2>{html}</section>')

body = "\n".join(parts)
html_doc = f'''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Preview — Course 03 Module 1</title>
  <link rel="stylesheet" href="/theme/student-dashboard/style.css">
  <style>
    body {{ background:#f4f6f8; font-family: system-ui, Arial, sans-serif; color:#222 }}
    .sd-content {{ max-width:1000px; margin:20px auto; padding:10px }}
    .page {{ background:#fff; padding:18px; margin:14px 0; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.06) }}
    pre code {{ background:#0b0b0b; color:#f8f8f2; padding:8px; display:block }}
  </style>
</head>
<body>
  <div class="sd-content">
    <header><h1>Electrical Systems Fundamentals — Module 1 (Preview)</h1></header>
    {body}
  </div>
</body>
</html>
'''

OUT.joinpath('preview_03_module1.html').write_text(html_doc, encoding='utf-8')
print('Wrote', OUT / 'preview_03_module1.html')
