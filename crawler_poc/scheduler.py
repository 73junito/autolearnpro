"""Simple scheduler: seed a task and push to Redis stream/list for fetchers."""
import json
import uuid
import os
import time
import redis

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
QUEUE = 'crawler:tasks'

r = redis.from_url(REDIS_URL)

def seed(url: str):
    task = {
        'task_id': str(uuid.uuid4()),
        'url': url,
        'priority': 10,
        'fetch_tier': 'auto',
        'capture_network': False,
        'logical_target': None,
        'metadata': {'origin': 'seed'}
    }
    r.lpush(QUEUE, json.dumps(task))
    print('seeded', task['task_id'], url)

if __name__ == '__main__':
    # simple CLI: seed and then watch queue length
    import sys
    if len(sys.argv) < 2:
        print('Usage: python scheduler.py <seed_url>')
        sys.exit(1)
    seed_url = sys.argv[1]
    seed(seed_url)
    time.sleep(0.5)
    print('queue length:', r.llen(QUEUE))
