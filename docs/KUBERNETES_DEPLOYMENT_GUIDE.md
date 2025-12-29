# Kubernetes Deployment Guide - AutoLearnPro LMS

This guide provides step-by-step instructions for deploying the AutoLearnPro LMS to a Kubernetes cluster.

## Prerequisites

- Kubernetes cluster (1.24+)
- `kubectl` CLI configured
- Cluster admin access (for initial setup)
- Domain name pointed to cluster ingress IP

## Architecture Overview

```
Internet → Cloudflare → Nginx Ingress → lms-api Service → lms-api Pods
                                              ↓
                                         PostgreSQL
                                         Redis
                                         PVC (uploads)
```

---

## Step 1: Install Required Components

### 1.1 Install cert-manager (TLS automation)

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.3/cert-manager.yaml

# Wait for cert-manager to be ready
kubectl wait --for=condition=Available --timeout=300s \
  deployment/cert-manager -n cert-manager
kubectl wait --for=condition=Available --timeout=300s \
  deployment/cert-manager-webhook -n cert-manager
```

### 1.2 Install ingress-nginx

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

# Wait for ingress controller
kubectl wait --for=condition=Available --timeout=300s \
  deployment/ingress-nginx-controller -n ingress-nginx
```

### 1.3 Verify installations

```bash
kubectl get pods -n cert-manager
kubectl get pods -n ingress-nginx
```

---

## Step 2: Create Namespace and Base Resources

### 2.1 Create namespace

```bash
kubectl apply -f k8s/autolearnpro/namespace.yaml
```

### 2.2 Apply resource quotas and limits

```bash
kubectl apply -f k8s/autolearnpro/resource-limits.yaml
```

### 2.3 Verify

```bash
kubectl get namespace autolearnpro
kubectl describe namespace autolearnpro
kubectl get resourcequota -n autolearnpro
kubectl get limitrange -n autolearnpro
```

---

## Step 3: Configure Secrets

### 3.1 Database credentials

```bash
kubectl -n autolearnpro create secret generic lms-api-secrets \
  --from-literal=DATABASE_URL='postgresql://user:pass@postgres:5432/lms_api_prod' \
  --from-literal=SECRET_KEY_BASE='<generate-with-mix-phx.gen.secret>' \
  --from-literal=GUARDIAN_SECRET_KEY='<generate-with-mix-phx.gen.secret>' \
  --from-literal=REDIS_URL='redis://redis:6379/0' \
  --dry-run=client -o yaml | kubectl apply -f -
```

**Generate secure keys:**
```bash
# In Elixir project directory
mix phx.gen.secret  # Run twice for two different secrets
```

### 3.2 Verify secrets

```bash
kubectl -n autolearnpro get secrets
kubectl -n autolearnpro describe secret lms-api-secrets
```

---

## Step 4: Configure Nginx for Cloudflare

### 4.1 Apply base nginx ConfigMap

```bash
kubectl apply -f k8s/autolearnpro/nginx-configmap.yaml
```

### 4.2 Populate Cloudflare IP ranges

```bash
chmod +x scripts/fetch-and-patch-cloudflare-ips.sh
./scripts/fetch-and-patch-cloudflare-ips.sh ingress-nginx nginx-configuration
```

### 4.3 Verify configuration

```bash
kubectl -n ingress-nginx describe configmap nginx-configuration
kubectl -n ingress-nginx get configmap nginx-configuration -o yaml | grep -A 30 set-real-ip-from
```

---

## Step 5: Configure TLS Certificates

### 5.1 Update email in ClusterIssuer

Edit `k8s/autolearnpro/clusterissuer.yaml`:
```yaml
email: your-email@autolearnpro.com  # UPDATE THIS
```

### 5.2 Apply ClusterIssuer

```bash
kubectl apply -f k8s/autolearnpro/clusterissuer.yaml
```

### 5.3 Verify ClusterIssuers

```bash
kubectl get clusterissuer
kubectl describe clusterissuer letsencrypt-prod
```

**Note:** Use `letsencrypt-staging` for testing first to avoid rate limits.

---

## Step 6: Deploy Application

### 6.1 Deploy core resources

```bash
# Deploy in order:
kubectl apply -f k8s/autolearnpro/deployment.yaml
kubectl apply -f k8s/autolearnpro/service.yaml
kubectl apply -f k8s/autolearnpro/hpa.yaml
kubectl apply -f k8s/autolearnpro/pdb.yaml
```

### 6.2 Wait for rollout

```bash
kubectl -n autolearnpro rollout status deployment/lms-api --timeout=300s
```

### 6.3 Verify deployment

```bash
kubectl -n autolearnpro get deployments
kubectl -n autolearnpro get pods -o wide
kubectl -n autolearnpro get hpa
kubectl -n autolearnpro get pdb
```

---

## Step 7: Configure Ingress

### 7.1 Update domain in ingress.yaml

Edit `k8s/autolearnpro/ingress.yaml`:
```yaml
spec:
  tls:
    - hosts:
        - your-domain.com  # UPDATE THIS
      secretName: lms-tls
  rules:
    - host: your-domain.com  # UPDATE THIS
```

### 7.2 Apply ingress

```bash
kubectl apply -f k8s/autolearnpro/ingress.yaml
```

### 7.3 Wait for TLS certificate

```bash
# Check certificate request
kubectl -n autolearnpro get certificate
kubectl -n autolearnpro describe certificate lms-tls

# Check certificate issuance (may take 1-2 minutes)
kubectl -n autolearnpro get certificate lms-tls -w
```

Expected output when ready:
```
NAME      READY   SECRET    AGE
lms-tls   True    lms-tls   2m
```

### 7.4 Get ingress IP

```bash
kubectl -n autolearnpro get ingress lms-ingress
```

**Important:** Point your domain DNS A record to this IP address.

---

## Step 8: Apply Network Security (Optional but Recommended)

```bash
kubectl apply -f k8s/autolearnpro/networkpolicy.yaml
```

Verify:
```bash
kubectl -n autolearnpro get networkpolicy
kubectl -n autolearnpro describe networkpolicy lms-api-netpol
```

---

## Step 9: Run Smoke Tests

### 9.1 Internal health check

```bash
kubectl -n autolearnpro run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl -v http://lms-api/api/health
```

Expected: `{"status":"ok"}` or similar

### 9.2 Run automated smoke test

```bash
kubectl apply -f k8s/autolearnpro/09-smoke-test-idempotent.yaml
kubectl -n autolearnpro wait --for=condition=complete job/smoke-test-idempotent --timeout=120s
kubectl -n autolearnpro logs -l job-name=smoke-test-idempotent
```

### 9.3 External test (after DNS propagation)

```bash
curl -v https://your-domain.com/api/health
```

---

## Step 10: Database Migration

If you need to run database migrations:

```bash
# Create migration job
kubectl -n autolearnpro run -it --rm migrate \
  --image=ghcr.io/73junito/lms-api:latest \
  --restart=Never \
  --env="MIX_ENV=prod" \
  --command -- /bin/sh -c "mix ecto.migrate"
```

Or exec into running pod:
```bash
POD=$(kubectl -n autolearnpro get pod -l app=lms-api -o jsonpath='{.items[0].metadata.name}')
kubectl -n autolearnpro exec -it $POD -- bin/lms_api eval "LmsApi.Release.migrate"
```

---

## Step 11: Verify Full Stack

### 11.1 Run comprehensive service tests

```bash
chmod +x scripts/test-services.sh
KUBECONFIG=~/.kube/config ./scripts/test-services.sh autolearnpro
```

### 11.2 Check all resources

```bash
kubectl -n autolearnpro get all
kubectl -n autolearnpro get ingress
kubectl -n autolearnpro get certificate
kubectl -n autolearnpro get pvc
kubectl -n autolearnpro get networkpolicy
```

### 11.3 View logs

```bash
# Recent logs
kubectl -n autolearnpro logs -l app=lms-api --tail=100

# Follow logs
kubectl -n autolearnpro logs -l app=lms-api -f

# Specific pod logs
kubectl -n autolearnpro logs <pod-name>
```

---

## CI/CD Setup

### Option 1: OIDC Authentication (Recommended)

See **[docs/CI_OIDC_SETUP.md](CI_OIDC_SETUP.md)** for detailed instructions for:
- GKE Workload Identity
- AWS IRSA (EKS)
- Azure Workload Identity Federation (AKS)

### Option 2: Kubeconfig Secret (Fallback)

```bash
# Generate service account and kubeconfig
./scripts/set-kubeconfig-secret.sh

# Add to GitHub secrets
# Repository → Settings → Secrets → Actions → New repository secret
# Name: KUBECONFIG_DATA
# Value: <base64-encoded kubeconfig>
```

---

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl -n autolearnpro get pods
kubectl -n autolearnpro describe pod <pod-name>

# Check events
kubectl -n autolearnpro get events --sort-by='.lastTimestamp'

# Check logs
kubectl -n autolearnpro logs <pod-name>
```

### Certificate not issuing

```bash
# Check certificate status
kubectl -n autolearnpro describe certificate lms-tls

# Check certificate request
kubectl -n autolearnpro get certificaterequest
kubectl -n autolearnpro describe certificaterequest <name>

# Check cert-manager logs
kubectl -n cert-manager logs -l app=cert-manager
```

### Ingress not working

```bash
# Check ingress
kubectl -n autolearnpro describe ingress lms-ingress

# Check ingress controller logs
kubectl -n ingress-nginx logs -l app.kubernetes.io/component=controller

# Verify service endpoints
kubectl -n autolearnpro get endpoints lms-api
```

### Health check failing

```bash
# Port-forward to pod
kubectl -n autolearnpro port-forward deployment/lms-api 4000:4000

# Test locally
curl http://localhost:4000/api/health

# Check app logs
kubectl -n autolearnpro logs -l app=lms-api --tail=100
```

### PVC not binding

```bash
# Check PVC status
kubectl -n autolearnpro get pvc
kubectl -n autolearnpro describe pvc lms-api-uploads-pvc

# Check available storage classes
kubectl get storageclass

# Update deployment.yaml with correct storageClassName if needed
```

---

## Maintenance Operations

### Update application image

```bash
# Set new image
kubectl -n autolearnpro set image deployment/lms-api \
  lms-api=ghcr.io/73junito/lms-api:new-tag

# Monitor rollout
kubectl -n autolearnpro rollout status deployment/lms-api

# Rollback if needed
kubectl -n autolearnpro rollout undo deployment/lms-api
```

### Scale deployment

```bash
# Manual scaling
kubectl -n autolearnpro scale deployment/lms-api --replicas=3

# Check HPA status
kubectl -n autolearnpro get hpa
kubectl -n autolearnpro describe hpa lms-api-hpa
```

### Update Cloudflare IPs (monthly recommended)

```bash
./scripts/fetch-and-patch-cloudflare-ips.sh ingress-nginx nginx-configuration
```

### Backup and restore

```bash
# Backup all manifests
kubectl -n autolearnpro get all -o yaml > backup-$(date +%Y%m%d).yaml

# Backup secrets (store securely)
kubectl -n autolearnpro get secrets -o yaml > secrets-backup-$(date +%Y%m%d).yaml

# Backup PVC data (depends on storage provider)
# For managed disks, use cloud provider snapshot tools
```

---

## Security Checklist

- [ ] Secrets stored securely (not in Git)
- [ ] TLS certificates auto-renewing via cert-manager
- [ ] Cloudflare IP ranges up-to-date in nginx ConfigMap
- [ ] NetworkPolicy applied (pod isolation)
- [ ] ResourceQuota and LimitRange configured
- [ ] Non-root container security context
- [ ] RBAC configured for CI/CD (minimal permissions)
- [ ] Regular security updates via Dependabot
- [ ] Pod Security Standards applied (if available)

---

## Monitoring & Observability

### Recommended additions (not included in base manifests)

1. **Prometheus + Grafana**
   - Add ServiceMonitor for metrics scraping
   - Dashboard for application metrics

2. **Loki for log aggregation**
   - Centralized logging
   - Log queries and alerts

3. **Jaeger/Tempo for tracing**
   - Distributed tracing
   - Performance analysis

4. **Alertmanager**
   - Alert on pod crashes
   - Certificate expiration warnings
   - Resource quota limits

---

## Cluster Resource Requirements

### Minimum cluster specifications

- **Nodes:** 2+ (for HA)
- **CPU:** 2+ cores per node
- **Memory:** 4GB+ per node
- **Storage:** 50GB+ (for PVCs)

### Recommended for production

- **Nodes:** 3+ (across availability zones)
- **CPU:** 4+ cores per node
- **Memory:** 8GB+ per node
- **Storage:** 200GB+ with fast SSDs

---

## Next Steps

1. Set up monitoring (Prometheus/Grafana)
2. Configure log aggregation (Loki/ELK)
3. Implement backup strategy for PVCs
4. Set up alerting for critical issues
5. Configure horizontal pod autoscaling based on load testing
6. Document runbooks for common operational tasks

---

## Support & Documentation

- **Cluster Verification Report:** [docs/CLUSTER_VERIFICATION_REPORT.md](CLUSTER_VERIFICATION_REPORT.md)
- **CI/CD OIDC Setup:** [docs/CI_OIDC_SETUP.md](CI_OIDC_SETUP.md)
- **API Consumer Guide:** [docs/API_CONSUMER_GUIDE.md](API_CONSUMER_GUIDE.md)
- **Database Indexes:** [docs/DATABASE_INDEXES.md](DATABASE_INDEXES.md)

For issues or questions, open an issue on GitHub: https://github.com/73junito/autolearnpro/issues
