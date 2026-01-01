#!/usr/bin/env python3
"""Validate JSON files against module_model.schema.json.

Writes per-file JSON and text reports next to each validated file and
an overall summary at outputs/schema_validation_summary.txt.
"""
import os
import sys
import json
import glob
import subprocess


def ensure_jsonschema():
    try:
        import jsonschema  # noqa: F401
        return
    except ImportError:
        print('`jsonschema` not found — installing into venv...')
        cmd = [sys.executable, '-m', 'pip', 'install', 'jsonschema']
        subprocess.check_call(cmd)


def load_schema(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def validate_instance(schema, instance):
    import jsonschema
    validator = jsonschema.Draft7Validator(schema)
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))
    items = []
    for e in errors:
        items.append({
            'path': list(e.path),
            'message': e.message,
            'validator': getattr(e, 'validator', None)
        })
    return items


def write_reports(target, report):
    # JSON report
    base = os.path.splitext(target)[0]
    out_json = base + '.schema_validation_report.json'
    out_txt = base + '.schema_validation_report.txt'
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)
    with open(out_txt, 'w', encoding='utf-8') as f:
        f.write('Valid: %s\n' % str(report.get('valid', False)))
        f.write('File: %s\n' % target)
        f.write('Errors: %d\n\n' % len(report.get('errors', [])))
        for idx, e in enumerate(report.get('errors', []), 1):
            f.write('--- Error %d ---\n' % idx)
            f.write('Path: %s\n' % json.dumps(e.get('path')))
            f.write('Message: %s\n\n' % e.get('message'))


def main():
    here = os.getcwd()
    schema_path = os.path.join(here, 'module_model.schema.json')
    if not os.path.exists(schema_path):
        print('Schema not found at', schema_path)
        sys.exit(2)

    ensure_jsonschema()
    schema = load_schema(schema_path)

    # Find candidate JSON files
    candidates = []
    # example file at repo root
    ex = os.path.join(here, 'example_course_modules.json')
    if os.path.exists(ex):
        candidates.append(ex)

    pattern = os.path.join(here, 'content', 'courses', '*', 'generated', '*.json')
    candidates.extend(glob.glob(pattern))

    os.makedirs(os.path.join(here, 'outputs'), exist_ok=True)
    summary = {
        'total': 0,
        'valid': 0,
        'invalid': 0,
        'details': []
    }

    if not candidates:
        print('No candidate JSON files found to validate.')

    for c in sorted(candidates):
        summary['total'] += 1
        with open(c, 'r', encoding='utf-8') as f:
            try:
                instance = json.load(f)
            except Exception as e:
                report = {'valid': False, 'errors': [{'path': [], 'message': 'JSON parse error: %s' % e}]}
                write_reports(c, report)
                summary['invalid'] += 1
                summary['details'].append({'file': c, 'valid': False, 'errorCount': 1})
                print('PARSE ERROR:', c)
                continue

        errors = validate_instance(schema, instance)
        report = {'valid': len(errors) == 0, 'errors': errors}
        write_reports(c, report)
        if report['valid']:
            summary['valid'] += 1
            print('VALID:', c)
        else:
            summary['invalid'] += 1
            print('INVALID:', c, '->', len(errors), 'errors')
        summary['details'].append({'file': c, 'valid': report['valid'], 'errorCount': len(errors)})

    summary_path = os.path.join(here, 'outputs', 'schema_validation_summary.json')
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)

    txt_path = os.path.join(here, 'outputs', 'schema_validation_summary.txt')
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write('Total files: %d\nValid: %d\nInvalid: %d\n' % (summary['total'], summary['valid'], summary['invalid']))
        f.write('\nFiles:\n')
        for d in summary['details']:
            f.write('- %s : %s (%d errors)\n' % (d['file'], 'OK' if d['valid'] else 'FAIL', d['errorCount']))

    print('\nSummary written to', summary_path)


if __name__ == '__main__':
    main()
