#!/usr/bin/env python3
"""
Inspect `courses` table columns in the in-cluster Postgres database.

Usage:
  python scripts/inspect_courses_table.py            # auto-discover pod in 'autolearnpro' namespace
  python scripts/inspect_courses_table.py --pg-pod postgres-abc --namespace autolearnpro

This script runs `kubectl exec` to call `psql` inside the Postgres pod and prints
columns from information_schema for `public.courses`.
"""
import argparse
import subprocess
import sys


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


def query_columns(pg_pod: str, namespace: str):
    sql = (
        "SELECT column_name, data_type, is_nullable, character_maximum_length "
        "FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = 'courses' "
        "ORDER BY ordinal_position;"
    )

    cmd = [
        "kubectl", "exec", "-n", namespace, pg_pod, "--",
        "psql", "-U", "postgres", "-d", "lms_api_prod", "-t", "-A", "-F", "\t", "-c", sql
    ]

    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    except subprocess.TimeoutExpired:
        raise RuntimeError("psql query timed out")

    if r.returncode != 0:
        raise RuntimeError(f"psql error: {r.stderr.strip()}")

    out = r.stdout.strip()
    if not out:
        print("No columns returned - table may not exist or has no columns.")
        return

    print("columns:\n")
    for line in out.splitlines():
        cols = line.split("\t")
        # columns: column_name, data_type, is_nullable, character_maximum_length
        name = cols[0] if len(cols) > 0 else ""
        dtype = cols[1] if len(cols) > 1 else ""
        nullable = cols[2] if len(cols) > 2 else ""
        length = cols[3] if len(cols) > 3 else ""
        print(f"- {name}: {dtype} nullable={nullable} max_length={length}")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Inspect courses table columns via kubectl/psql")
    parser.add_argument("--pg-pod", help="Postgres pod name (optional)")
    parser.add_argument("--namespace", default="autolearnpro", help="K8s namespace where Postgres runs")
    args = parser.parse_args(argv)

    try:
        pg_pod = args.pg_pod
        if not pg_pod:
            pg_pod = discover_pg_pod(args.namespace)
        print(f"Using Postgres pod: {pg_pod} (namespace: {args.namespace})")
        query_columns(pg_pod, args.namespace)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
