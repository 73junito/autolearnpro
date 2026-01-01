import json
import sys
from pathlib import Path

def normalize_written_steps(ws):
    # written_steps can be a single markdown string or a list of step strings
    if isinstance(ws, list):
        return "\n".join(str(x) for x in ws)
    return str(ws or "")

def analyze_file(p: Path):
    try:
        js = json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        print(f'ERROR reading {p}: {e}')
        return None

    ws_raw = js.get('written_steps', '')
    ws = normalize_written_steps(ws_raw)
    num_steps = sum(1 for l in ws.splitlines() if l.strip() and l.strip()[0].isdigit())
    checklist_lines = [l for l in ws.splitlines() if l.strip().startswith('- ')]
    word_count = len(str(js.get('audio_script', '')).split())
    practice = len(js.get('practice_activities', []) or [])
    visuals = len(js.get('visual_diagrams', []) or [])

    return {
        'file': str(p),
        'numbered_steps': num_steps,
        'checklist_items': len(checklist_lines),
        'audio_word_count': word_count,
        'practice_activities': practice,
        'visual_diagrams': visuals,
    }

def main(argv):
    paths = argv[1:] or ['scripts/data/multimodal/auto-diesel/brakes/brake-safety.json']
    results = []
    for p in paths:
        # Expand simple glob patterns or discover files under the multimodal folder
        if '*' in p or (p.endswith('.json') and not Path(p).exists()):
            found = list(Path('scripts/data/multimodal').rglob('*.json'))
            if not found:
                print(f'SKIP (no matches for): {p}')
                continue
            for f in found:
                res = analyze_file(f)
                if res:
                    results.append(res)
            continue

        pth = Path(p)
        if not pth.exists():
            print(f'SKIP (missing): {p}')
            continue
        res = analyze_file(pth)
        if res:
            results.append(res)

    if not results:
        print('No files analyzed.')
        return 2

    # Print a concise table-like summary
    for r in results:
        print(f"File: {r['file']}")
        print(f"  Numbered steps: {r['numbered_steps']}")
        print(f"  Checklist items: {r['checklist_items']}")
        print(f"  Audio word count: {r['audio_word_count']}")
        print(f"  Practice activities: {r['practice_activities']}")
        print(f"  Visual diagrams: {r['visual_diagrams']}")

    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
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
