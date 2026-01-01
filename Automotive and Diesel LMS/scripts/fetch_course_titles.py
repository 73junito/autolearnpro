#!/usr/bin/env python3
"""
Fetch course titles from the in-cluster Postgres database.

Usage:
  python scripts/fetch_course_titles.py            # auto-discover pod in 'autolearnpro' namespace
  python scripts/fetch_course_titles.py --pg-pod postgres-abc --namespace autolearnpro

Outputs JSON array of objects with 'id' and 'title' keys.
"""
import argparse
import subprocess
import sys
import json


def discover_pg_pod(namespace: str) -> str:
    try:
        r = subprocess.run([
            "kubectl", "get", "pod", "-n", namespace,
            "-l", "app=postgres", "-o", "jsonpath={.items[0].metadata.name}"
        ], capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip() or "kubectl failed")
        return r.stdout.strip()
    except Exception as e:
        raise RuntimeError(f"Failed to discover postgres pod: {e}")


def fetch_titles(pg_pod: str, namespace: str):
    sql = "SELECT id, title FROM public.courses ORDER BY id;"

    cmd = [
        "kubectl", "exec", "-n", namespace, pg_pod, "--",
        "psql", "-U", "postgres", "-d", "lms_api_prod", "-t", "-A", "-F", "\t", "-c", sql
    ]

    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        raise RuntimeError("psql query timed out")

    if r.returncode != 0:
        raise RuntimeError(f"psql error: {r.stderr.strip()}")

    lines = r.stdout.strip().split('\n')
    courses = []
    for line in lines:
        if line.strip():
            parts = line.split('\t')
            if len(parts) == 2:
                courses.append({"id": int(parts[0]), "title": parts[1]})

    return courses


def main():
    parser = argparse.ArgumentParser(description="Fetch course titles from Postgres")
    parser.add_argument("--pg-pod", help="Postgres pod name")
    parser.add_argument("--namespace", default="autolearnpro", help="Kubernetes namespace")
    args = parser.parse_args()

    try:
        pg_pod = args.pg_pod or discover_pg_pod(args.namespace)
        print(f"Using Postgres pod: {pg_pod}", file=sys.stderr)

        courses = fetch_titles(pg_pod, args.namespace)
        print(json.dumps(courses, indent=2))

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()