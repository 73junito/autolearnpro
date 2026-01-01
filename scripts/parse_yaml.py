import sys
from pathlib import Path

path = Path('.github/workflows/web-ci.yml')
if not path.exists():
    print('file not found:', path)
    sys.exit(2)
try:
    import yaml
except Exception as e:
    print('PyYAML import failed:', e)
    sys.exit(3)
try:
    s = path.read_text(encoding='utf8')
    yaml.safe_load(s)
    print('YAML OK')
except Exception as e:
    print('YAML parse error:')
    print(e)
    # print context lines around 173
    lines = s.splitlines()
    line_no = getattr(e, 'problem_mark', None)
    if line_no is not None:
        try:
            ln = line_no.line
        except Exception:
            ln = 173
    else:
        ln = 173
    start = max(1, ln-3)
    end = min(len(lines), ln+3)
    for i in range(start, end+1):
        print(f"{i:04}: {lines[i-1]}")
    sys.exit(1)
