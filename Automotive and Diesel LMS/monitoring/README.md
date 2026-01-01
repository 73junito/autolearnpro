GPU monitoring with Prometheus + DCGM exporter

This folder contains a minimal Prometheus configuration and instructions to start a basic GPU metrics stack.

Services added to `docker-compose.yml`:
- `dcgm-exporter` (NVIDIA DCGM exporter) on port `9400`
- `prometheus` on port `9090` (reads `monitoring/prometheus.yml`)

Quick start (from repository root):

- Start the monitoring stack:

```powershell
# starts prometheus and dcgm-exporter
docker compose up -d prometheus dcgm-exporter
```

- Open Prometheus UI: http://localhost:9090
- Verify DCGM metrics: http://localhost:9400/metrics

Notes
- `dcgm-exporter` requires Docker + NVIDIA container integration (already configured earlier).
- Adjust `monitoring/prometheus.yml` to add alerting or Grafana dashboards as needed.
