"""Indexer: consumes LearningObject messages from Redis and writes to Postgres versions.

Run: python indexer.py
"""
import os
import json
import time
import redis
from db import ensure_schema, upsert_logical_object, get_latest_version_hash, insert_version

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
LO_QUEUE = 'crawler:learning_objects'

r = redis.from_url(REDIS_URL)


def normalize_hash(h):
    if not h:
        return None
    return h


def index_loop():
    print('indexer started, ensuring schema...')
    ensure_schema()
    print('schema ensured, waiting for LOs...')
    while True:
        item = r.brpop(LO_QUEUE, timeout=5)
        if not item:
            time.sleep(0.5)
            continue
        _, raw = item
        try:
            lo = json.loads(raw)
            logical_id = lo.get('logical_id')
            type_ = lo.get('type')
            title = lo.get('title')
            course_id = lo.get('course_id')
            module_id = lo.get('module_id')
            version_meta = lo.get('version_meta', {})
            content_hash = normalize_hash(version_meta.get('content_hash'))
            crawl_time = version_meta.get('crawl_time')
            blob_path = None
            refs = lo.get('content_refs') or []
            if refs:
                blob_path = refs[0].get('blob_path')
            # upsert logical object
            upsert_logical_object(logical_id, type_, title, course_id, module_id)
            # insert version only if hash differs
            last_hash = get_latest_version_hash(logical_id)
            if content_hash != last_hash:
                insert_version(logical_id, content_hash, crawl_time, blob_path, fetch_task_id=None)
                print('inserted new version for', logical_id)
            else:
                print('no change for', logical_id)
        except Exception as e:
            print('indexer error processing item', e)

if __name__ == '__main__':
    index_loop()
