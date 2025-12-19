import json
import sys
p = 'scripts/data/multimodal/auto-diesel/brakes/brake-safety.json'
try:
    js = json.load(open(p, encoding='utf-8'))
except Exception as e:
    print('ERROR', e)
    sys.exit(2)
ws = js.get('written_steps', '')
num_steps = sum(1 for l in ws.splitlines() if l.strip() and l.strip()[0].isdigit())
checklist_lines = [l for l in ws.splitlines() if l.strip().startswith('- ')]
word_count = len(js.get('audio_script', '').split())
practice = len(js.get('practice_activities', []))
visuals = len(js.get('visual_diagrams', []))
print(f'Numbered steps: {num_steps}')
print(f'Checklist items: {len(checklist_lines)}')
print(f'Audio word count: {word_count}')
print(f'Practice activities: {practice}')
print(f'Visual diagrams: {visuals}')
