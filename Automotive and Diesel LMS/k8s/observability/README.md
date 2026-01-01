# Observability Stack Setup Guide

## Overview

This directory contains Kubernetes manifests for deploying a complete observability stack for AutoLearnPro LMS:

- **Prometheus**: Metrics collection and time-series database
- **Grafana**: Metrics visualization and dashboards
- **ServiceMonitors**: Automated service discovery for metrics scraping

## Prerequisites

1. Kubernetes cluster with kubectl configured
2. cert-manager installed (for TLS certificates)
3. ingress-nginx installed
4. StorageClass named 'standard' (or update PVC manifests)

## Quick Start

### 1. Deploy Prometheus

```bash
kubectl apply -f k8s/observability/prometheus.yaml
```

**Wait for Prometheus to be ready:**
```bash
kubectl -n monitoring rollout status deployment/prometheus
kubectl -n monitoring get pods -l app=prometheus
```

### 2. Deploy Grafana

**Important:** Update the admin password before deploying:
```bash
# Edit grafana.yaml and change 'changeme' to a strong password
kubectl apply -f k8s/observability/grafana.yaml
```

**Wait for Grafana to be ready:**
```bash
kubectl -n monitoring rollout status deployment/grafana
kubectl -n monitoring get pods -l app=grafana
```

### 3. Deploy ServiceMonitors (Optional - requires Prometheus Operator)

```bash
kubectl apply -f k8s/observability/servicemonitor.yaml
```

## Accessing the Services

### Prometheus UI

**Port-forward method:**
```bash
kubectl -n monitoring port-forward svc/prometheus 9090:9090
```
Then visit: http://localhost:9090

### Grafana UI

**Via Ingress (recommended):**
1. Update DNS: Point `grafana.autolearnpro.com` to your ingress IP
2. Visit: https://grafana.autolearnpro.com
3. Login: admin / [your-password]

**Port-forward method:**
```bash
kubectl -n monitoring port-forward svc/grafana 3000:3000
```
Then visit: http://localhost:3000

## Configuration

### Prometheus Configuration

Prometheus is configured via ConfigMap `prometheus-config`. Key scrape jobs:

- **kubernetes-apiservers**: Kubernetes API metrics
- **kubernetes-nodes**: Node metrics (CPU, memory, disk)
- **kubernetes-pods**: Pod metrics (with `prometheus.io/scrape: "true"` annotation)
- **lms-api**: AutoLearnPro LMS API metrics
- **ingress-nginx**: Ingress controller metrics

**To add custom scrape configs:**
```bash
kubectl -n monitoring edit configmap prometheus-config
# Add your scrape_configs
kubectl -n monitoring rollout restart deployment/prometheus
```

### Grafana Configuration

Grafana automatically configures Prometheus as a datasource. To add custom dashboards:

1. Visit Grafana UI
2. Navigate to Dashboards → Import
3. Import dashboard JSON or use ID from grafana.com

**Recommended dashboards:**
- **Kubernetes Cluster Monitoring**: Dashboard ID 315
- **NGINX Ingress Controller**: Dashboard ID 9614
- **Node Exporter Full**: Dashboard ID 1860

## Metrics Collection

### Enable Metrics on LMS API

Add Prometheus annotations to your LMS API deployment:

```yaml
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "4000"
        prometheus.io/path: "/metrics"
```

**Apply changes:**
```bash
kubectl -n autolearnpro rollout restart deployment/lms-api
```

### Verify Metrics Collection

```bash
# Check Prometheus targets
kubectl -n monitoring port-forward svc/prometheus 9090:9090
# Visit: http://localhost:9090/targets

# Query metrics
curl -s "http://localhost:9090/api/v1/query?query=up"
```

## Storage Management

### Prometheus Storage

- **Default retention**: 30 days
- **Storage size**: 50Gi (adjust in `prometheus.yaml`)

**To increase retention:**
```yaml
args:
- '--storage.tsdb.retention.time=90d'  # Change to desired retention
```

### Grafana Storage

- **Storage size**: 10Gi (adjust in `grafana.yaml`)
- Stores dashboards, users, and configurations

## Troubleshooting

### Prometheus not scraping targets

```bash
# Check Prometheus logs
kubectl -n monitoring logs deployment/prometheus

# Verify ServiceAccount permissions
kubectl -n monitoring get serviceaccount prometheus
kubectl describe clusterrolebinding prometheus

# Test connectivity to target
kubectl -n monitoring exec -it deployment/prometheus -- wget -O- http://lms-api.autolearnpro:4000/metrics
```

### Grafana login issues

```bash
# Reset admin password
kubectl -n monitoring exec -it deployment/grafana -- grafana-cli admin reset-admin-password newpassword

# Check logs
kubectl -n monitoring logs deployment/grafana
```

### Storage issues

```bash
# Check PVC status
kubectl -n monitoring get pvc

# Check storage usage
kubectl -n monitoring exec -it deployment/prometheus -- df -h /prometheus
kubectl -n monitoring exec -it deployment/grafana -- df -h /var/lib/grafana
```

## Maintenance

### Backup Grafana Dashboards

```bash
# Export dashboards via API
kubectl -n monitoring port-forward svc/grafana 3000:3000

# Use Grafana API to export all dashboards
curl -u admin:password http://localhost:3000/api/search | \
  jq -r '.[] | select(.type == "dash-db") | .uid' | \
  xargs -I {} curl -u admin:password http://localhost:3000/api/dashboards/uid/{} > dashboard_{}.json
```

### Upgrade Prometheus

```bash
# Update image in prometheus.yaml
# image: prom/prometheus:v2.49.0

kubectl apply -f k8s/observability/prometheus.yaml
kubectl -n monitoring rollout status deployment/prometheus
```

### Upgrade Grafana

```bash
# Update image in grafana.yaml
# image: grafana/grafana:10.3.0

kubectl apply -f k8s/observability/grafana.yaml
kubectl -n monitoring rollout status deployment/grafana
```

## Security Considerations

1. **Change default Grafana password** before deploying
2. Use **HTTPS only** for Grafana ingress (enabled by default)
3. Consider **network policies** to restrict access to monitoring namespace
4. Enable **authentication** on Prometheus (not included in basic setup)
5. Use **RBAC** to restrict Grafana user permissions

## Resource Requirements

| Service | CPU Request | Memory Request | CPU Limit | Memory Limit | Storage |
|---------|-------------|----------------|-----------|--------------|---------|
| Prometheus | 200m | 512Mi | 1000m | 2Gi | 50Gi |
| Grafana | 100m | 256Mi | 500m | 512Mi | 10Gi |

**Total minimum**: 300m CPU, 768Mi memory, 60Gi storage

## Integration with Alerting

For production environments, consider integrating with:

- **Alertmanager**: Alert routing and notification
- **PagerDuty**: On-call alerting
- **Slack**: Team notifications
- **Opsgenie**: Incident management

Example Alertmanager integration coming soon.

## Support

For issues or questions:
- Check [CLUSTER_VERIFICATION_REPORT.md](../../docs/CLUSTER_VERIFICATION_REPORT.md)
- Review [KUBERNETES_DEPLOYMENT_GUIDE.md](../../docs/KUBERNETES_DEPLOYMENT_GUIDE.md)
- Open issue on GitHub: https://github.com/73junito/autolearnpro/issues
