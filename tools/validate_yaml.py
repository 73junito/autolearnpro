import yaml
import sys

path = r".github/workflows/test-coverage.yml"
try:
    with open(path, 'r', encoding='utf-8') as f:
        s = f.read()
    yaml.safe_load(s)
    print('YAML OK')
except Exception as e:
    print('YAML ERROR:', e)
    sys.exit(2)
