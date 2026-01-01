#!/usr/bin/env python3
"""Check basic frontend/backend connectivity for local development.

- Checks backend health endpoint (default http://localhost:4000/api/health)
- Checks frontend dev server (http://localhost:3000)
- Checks for a built frontend (frontend/web/.next)

Exit codes:
 0 = at least one of backend or frontend reachable or frontend build present
 1 = none reachable / build missing
"""
import os
import sys
import requests
from pathlib import Path
from urllib.parse import urljoin

API_BASE = os.getenv('NEXT_PUBLIC_API_URL') or os.getenv('IMAGE_API_URL') or 'http://localhost:4000/api'
BACKEND_HEALTH = urljoin(API_BASE.rstrip('/') + '/', 'health')
FRONTEND_DEV = os.getenv('NEXT_PUBLIC_FRONTEND') or 'http://localhost:3000'
FRONTEND_BUILD_DIR = Path('frontend/web/.next')

TIMEOUT = float(os.getenv('CONNECTIVITY_TIMEOUT', '5'))

ok = False

print(f"Backend health URL: {BACKEND_HEALTH}")
try:
    r = requests.get(BACKEND_HEALTH, timeout=TIMEOUT)
    print(f"Backend response: {r.status_code}")
    try:
        print("Backend body:", r.json())
    except Exception:
        print("Backend body (text):", r.text[:1000])
    if r.ok:
        ok = True
except requests.exceptions.RequestException as e:
    print(f"Backend health check failed: {e}")

print(f"Checking frontend dev server at: {FRONTEND_DEV}")
try:
    r2 = requests.get(FRONTEND_DEV, timeout=TIMEOUT)
    print(f"Frontend dev response: {r2.status_code}")
    ok = True
except requests.exceptions.RequestException as e:
    print(f"Frontend dev server not reachable: {e}")

print(f"Checking frontend build directory: {FRONTEND_BUILD_DIR}")
if FRONTEND_BUILD_DIR.exists() and any(FRONTEND_BUILD_DIR.iterdir()):
    print("Frontend build exists")
    ok = True
else:
    print("Frontend build not found")

if ok:
    print("Connectivity checks: SOME services reachable or build present")
    sys.exit(0)
else:
    print("Connectivity checks: nothing reachable and build missing")
    sys.exit(1)
