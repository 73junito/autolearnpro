POC Interface & Schema (compact)

1) Task (queue message)
```json
{
  "task_id": "uuid",
  "url": "https://lms.example.edu/course/123/module/5",
  "priority": 10,
  "fetch_tier": "auto", // auto | api | http | headless
  "capture_network": false,
  "logical_target": {
    "type": "CoursePage",
    "logical_id": "course:123:module:5"
  },
  "credentials_lease_id": null,
  "metadata": {"origin":"seed"}
}
```

2) FetchResult
```json
{
  "task_id":"uuid",
  "url":"...",
  "status_code":200,
  "content_type":"text/html",
  "body_path":"s3://blobs/abcd.html",
  "headers": {"etag":"\"abc\""},
  "fetch_tier":"http",
  "network_trace_path": null,
  "fetched_at":"2026-01-01T12:00:00Z"
}
```

3) LearningObject (emitted by parser)
```json
{
  "logical_id": "course:123:module:5:page:10",
  "type": "Page", // Course|Module|Page|Quiz|Assignment|Media
  "title": "Introduction to Brakes",
  "course_id": "course:123",
  "module_id": "module:5",
  "content_refs": [
    {"blob_path":"s3://blobs/abcd.html","content_hash":"sha256:..."}
  ],
  "extracted_at":"2026-01-01T12:00:05Z",
  "version_meta": {"content_hash":"sha256:...","crawl_time":"..."}
}
```

4) Versioning model
- Store `logical_id` as primary entity key.
- Each ingest creates a version row: (`logical_id`, `version_id`, `content_hash`, `crawl_time`, `fetch_task_id`).
- Query by `logical_id` to get latest or history.

5) PII-first rule
- Parser runs PII scanner on `body` prior to `body_path` write.
- If PII found and not allowlisted, redact and write sanitized blob; log detection event to audit table.

6) Auth lease contract (simple)
```json
{ "lease_id":"uuid", "credential_ref":"vault://path/to/cred", "expires_at":"...", "rate_budget": {"max_req_per_min":60} }
```

Notes
- All messages are idempotent; `task_id` and `fetch_task_id` ensure de-dup and retry handling.
- Headless network traces are optional and stored only when `capture_network` is true to control storage cost.
