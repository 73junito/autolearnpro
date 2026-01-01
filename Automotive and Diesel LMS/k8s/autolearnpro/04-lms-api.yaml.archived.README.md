# Archived Deployment Manifest

**Original File:** `04-lms-api.yaml`  
**Archived Date:** December 16, 2025  
**Reason:** Superseded by `deployment.yaml` which has production-ready configuration

## Differences from Active Deployment

This archived manifest was a simpler/test configuration with:
- 1 replica (vs 2 in production)
- Minimal resource limits
- No security context
- No liveness probe
- No PVC mounts
- Basic service configuration

## Current Deployment

Use `deployment.yaml` for all production deployments. It includes:
- High availability (2+ replicas with HPA)
- Proper resource requests/limits
- Security contexts (non-root)
- Health probes (liveness + readiness)
- PVC for uploads
- Graceful shutdown handling

## Migration Notes

If you were using this manifest:
1. Switch to `deployment.yaml`
2. Ensure secrets are named `lms-api-secrets`
3. Update image tag to use GHCR registry: `ghcr.io/73junito/lms-api:latest`
4. Apply HPA and PDB for production resilience

This file is kept for historical reference only.
