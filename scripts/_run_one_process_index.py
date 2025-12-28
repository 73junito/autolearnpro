from pathlib import Path
from scripts.standardize_course_index import process_index
p=Path('content/courses/14-advanced-engine-diagnostics/site/index.html')
print('Target:',p)
try:
    modified = process_index(p)
    print('Modified:', modified)
except Exception as e:
    print('Error:', e)
