Crawler POC - LMS Vertical Slice

Overview
- Purpose: small, production-minded vertical slice to validate crawling an LMS course: auth flows, API/HTTP/headless fetchers, parsing to Learning Objects, pre-storage PII scanning, and temporal versioning.

Architecture (summary)
- Scheduler / Frontier: prioritizes URLs, enforces per-host and per-token politeness and escalation rules.
- Queue: Redis Streams (durable) for distributing tasks.
- Auth Manager: leases credentials, refreshes tokens, emits session events.
- Fetcher tiers: Tier1 API, Tier2 HTTP, Tier3 Headless (Playwright). Scheduler escalates when needed.
- Parser/Extractor: emits typed Learning Objects (Course, Module, Page, Quiz, Media).
- Deduper/Canonicalizer: logical_id mapping + content hashing and temporal versioning.
- Storage: MinIO (raw blobs), Postgres (metadata + versions), OpenSearch (optional index).
- Observability: Prometheus + Grafana + OpenTelemetry.

Files
- component_diagram.svg — architecture diagram.
- README.md — this file.
- schema.md — compact interface and POC schemas.

Quick Start (developer)
1) Run MinIO and Postgres (docker-compose recommended).
2) Run a Redis server for the queue.
3) Start Auth Manager, Scheduler, and one of each fetcher.

Try locally (example)
```powershell
# start dependent services (example docker-compose)
docker-compose -f crawler_poc/docker-compose.yml up -d

# run scheduler
python -m crawler_poc.scheduler

# run a simple HTTP fetcher
python -m crawler_poc.fetchers.http_fetcher

# run headless worker
python -m crawler_poc.fetchers.headless_fetcher
```

Success criteria (POC)
- Crawl a single course end-to-end.
- Re-run: no duplicate logical objects created.
- Headless fetches <10% of requests.
- Metrics available for fetch/parse/store latencies.

Next steps
- Scaffold lightweight microservices and minimal docker-compose.
- Add a synthetic LMS testbed to validate parsing and auth flows.
