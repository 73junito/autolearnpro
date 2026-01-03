"""Minimal HTTP fetcher: BRPOP tasks, perform requests.get, save body to blobs/ and push fetch result to results list."""
import os
import time
import json
import requests
import uuid
from pathlib import Path
import redis

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
QUEUE = 'crawler:tasks'
RESULTS = 'crawler:results'
BLOBS_DIR = Path(os.getenv('BLOBS_DIR', 'crawler_poc/blobs'))
BLOBS_DIR.mkdir(parents=True, exist_ok=True)

r = redis.from_url(REDIS_URL)


def fetch_loop():
    print('HTTP fetcher started, waiting for tasks...')
    while True:
        item = r.brpop(QUEUE, timeout=5)
        if not item:
            time.sleep(0.5)
            continue
        _, raw = item
        task = json.loads(raw)
        url = task.get('url')
        task_id = task.get('task_id')
        try:
            resp = requests.get(url, timeout=15)
            body = resp.content
            blob_name = f"{uuid.uuid4()}.html"
            blob_path = BLOBS_DIR / blob_name
            with open(blob_path, 'wb') as f:
                f.write(body)
            result = {
                'task_id': task_id,
                'url': url,
                'status_code': resp.status_code,
                'content_type': resp.headers.get('Content-Type',''),
                'body_path': str(blob_path),
                'headers': dict(resp.headers),
                'fetch_tier': 'http',
                'network_trace_path': None,
                'fetched_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            }
            r.lpush(RESULTS, json.dumps(result))
            print('fetched', url, '->', blob_path)
        except Exception as e:
            print('fetch error for', url, e)

if __name__ == '__main__':
    fetch_loop()
