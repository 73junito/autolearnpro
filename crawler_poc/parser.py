"""Minimal parser: consume fetch results, run simple extraction, and print LearningObject JSON.
This is intentionally small — replace with robust extraction for production.
"""
import os
import json
import redis
from bs4 import BeautifulSoup
import time

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
RESULTS = 'crawler:results'

r = redis.from_url(REDIS_URL)


def parse_loop():
    print('parser started, waiting for fetch results...')
    while True:
        item = r.brpop(RESULTS, timeout=5)
        if not item:
            time.sleep(0.5)
            continue
        _, raw = item
        result = json.loads(raw)
        body_path = result.get('body_path')
        if not body_path:
            print('no body for', result.get('url'))
            continue
            try:
                with open(body_path, 'rb') as f:
                    html = f.read()
                soup = BeautifulSoup(html, 'lxml')
                title = soup.title.string.strip() if soup.title and soup.title.string else 'Untitled'
                lo = {
                    'logical_id': f"url:{result.get('url')}",
                    'type': 'Page',
                    'title': title,
                    'course_id': None,
                    'module_id': None,
                    'content_refs': [{'blob_path': body_path, 'content_hash': 'sha256:TODO'}],
                    'extracted_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    'version_meta': {'content_hash': 'sha256:TODO', 'crawl_time': result.get('fetched_at')}
                }
                # push LearningObject to Redis for indexing
                try:
                    r.lpush('crawler:learning_objects', json.dumps(lo))
                    print('ENQUEUED LO for indexing:', lo['logical_id'])
                except Exception as e:
                    print('failed to push LO to redis, falling back to stdout', e)
                    print('EXTRACTED LO:', json.dumps(lo))
        except Exception as e:
            print('parser error for', body_path, e)

if __name__ == '__main__':
    parse_loop()
