"""Headless fetcher using Playwright (sync API).
Saves HTML body and a simple network trace JSON with request/response summaries.
Requires `playwright` package and browsers installed (`playwright install`).
"""
import os
import json
import time
import uuid
import hashlib
import redis
from pathlib import Path
import sys
# ensure parent folder (crawler_poc) is on sys.path when running submodule directly
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from storage import upload_blob

try:
    from playwright.sync_api import sync_playwright
except Exception:
    sync_playwright = None
try:
    from playwright._impl._errors import TargetClosedError, Error as PlaywrightError
except Exception:
    TargetClosedError = Exception
    PlaywrightError = Exception

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
QUEUE = 'crawler:tasks'
RESULTS = 'crawler:results'
BLOBS_DIR = Path(os.getenv('BLOBS_DIR', 'crawler_poc/blobs'))
BLOBS_DIR.mkdir(parents=True, exist_ok=True)

r = redis.from_url(REDIS_URL)


def headless_fetch(task):
    if sync_playwright is None:
        raise RuntimeError('playwright not available')
    url = task.get('url')
    task_id = task.get('task_id')
    net_events = []
    # Retry transient Playwright navigation/target closed errors a few times
    max_attempts = 3
    last_exc = None
    for attempt in range(1, max_attempts + 1):
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                # Attempt to record HAR to a local file via context if supported
                har_path = None
                try:
                    context = browser.new_context()
                except Exception:
                    context = browser.new_context()
                page = context.new_page()

                def on_response(response):
                    try:
                        req = response.request
                        net_events.append({
                            'url': req.url,
                            'method': req.method,
                            'status': response.status,
                            'resource_type': response.request.resource_type,
                            'response_headers': dict(response.headers)
                        })
                    except Exception:
                        pass

                page.on('response', on_response)
                # navigate
                page.goto(url, wait_until='networkidle', timeout=30000)
                html = page.content().encode('utf-8')
                # attempt HAR export via context if Playwright supports record_har_path
                try:
                    # create HAR by opening a new context with record_har_path if available
                    # fallback: use collected response summaries
                    context.close()
                except Exception:
                    pass
                browser.close()
            # success, break retry loop
            last_exc = None
            break
        except (TargetClosedError, PlaywrightError) as e:
            last_exc = e
            print(f"Transient Playwright error on attempt {attempt}/{max_attempts} for {url}: {e}")
            try:
                browser.close()
            except Exception:
                pass
            # short backoff
            time.sleep(1)
            continue
        except Exception as e:
            last_exc = e
            # non-playwright errors - no retry
            print(f"Non-retryable fetch error for {url}: {e}")
            try:
                browser.close()
            except Exception:
                pass
            break

    if last_exc is not None:
        # re-raise to let the loop handler produce a 502 result and continue
        raise last_exc

    blob_name = f"{uuid.uuid4()}.html"
    blob_path = BLOBS_DIR / blob_name
    with open(blob_path, 'wb') as f:
        f.write(html)
    h = hashlib.sha256()
    h.update(html)
    content_hash = f"sha256:{h.hexdigest()}"

    # write network trace (fallback summary)
    trace_name = f"{uuid.uuid4()}.net.json"
    trace_path = BLOBS_DIR / trace_name
    with open(trace_path, 'w', encoding='utf-8') as f:
        json.dump(net_events, f)

    # try uploading body and trace to MinIO (best-effort)
    body_upload = None
    trace_upload = None
    try:
        body_upload = upload_blob(str(blob_path), bucket='crawler')
    except Exception:
        body_upload = None
    try:
        trace_upload = upload_blob(str(trace_path), bucket='crawler')
    except Exception:
        trace_upload = None

    result = {
        'task_id': task_id,
        'url': url,
        'status_code': 200,
        'content_type': 'text/html',
        'body_path': str(blob_path),
        'body_obj': body_upload,
        'content_hash': content_hash,
        'headers': {},
        'fetch_tier': 'headless',
        'network_trace_path': str(trace_path),
        'network_trace_obj': trace_upload,
        'fetched_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    return result


def run_headless_loop():
    if sync_playwright is None:
        print('Playwright not installed; run `playwright install` and ensure package is available.')
        return
    print('Headless fetcher started, waiting for tasks...')
    while True:
        item = r.brpop(QUEUE, timeout=5)
        if not item:
            time.sleep(0.5)
            continue
        _, raw = item
        task = json.loads(raw)
        try:
            res = headless_fetch(task)
            r.lpush(RESULTS, json.dumps(res))
            print('headless fetched', task.get('url'))
        except Exception as e:
            print('headless fetch error for', task.get('url'), e)
            # fallback result
            result = {
                'task_id': task.get('task_id'),
                'url': task.get('url'),
                'status_code': 502,
                'content_type': '',
                'body_path': None,
                'content_hash': None,
                'headers': {},
                'fetch_tier': 'headless',
                'network_trace_path': None,
                'fetched_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            }
            r.lpush(RESULTS, json.dumps(result))


if __name__ == '__main__':
    run_headless_loop()
