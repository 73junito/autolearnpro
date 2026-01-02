import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

DATABASE_URL = os.getenv('POSTGRES_URL', 'postgresql://crawler:crawlerpass@localhost:5432/crawlerdb')

@contextmanager
def get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def ensure_schema():
    # apply schema.sql if present
    path = os.path.join(os.path.dirname(__file__), 'db', 'schema.sql')
    if not os.path.exists(path):
        return
    with open(path, 'r', encoding='utf-8') as f:
        sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)

def upsert_logical_object(logical_id, type_, title, course_id, module_id):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
            INSERT INTO logical_objects (logical_id, type, title, course_id, module_id, updated_at)
            VALUES (%s,%s,%s,%s,%s,now())
            ON CONFLICT (logical_id) DO UPDATE SET
              title=EXCLUDED.title, type=EXCLUDED.type, course_id=EXCLUDED.course_id, module_id=EXCLUDED.module_id, updated_at=now()
            """, (logical_id, type_, title, course_id, module_id))

def get_latest_version_hash(logical_id):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT content_hash FROM object_versions WHERE logical_id=%s ORDER BY created_at DESC LIMIT 1", (logical_id,))
            row = cur.fetchone()
            return row[0] if row else None

def insert_version(logical_id, content_hash, crawl_time, blob_path, fetch_task_id=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
            INSERT INTO object_versions (logical_id, content_hash, crawl_time, blob_path, fetch_task_id)
            VALUES (%s,%s,%s,%s,%s)
            """, (logical_id, content_hash, crawl_time, blob_path, fetch_task_id))
