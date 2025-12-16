Deployment notes / checklist

- Use environment variables via Secret + ConfigMap / envFrom for runtime secrets. Example secret at `k8s/autolearnpro/secret-envfrom-example.yaml`.
- CI should update deployment image by SHA, not `latest`. Example:
  kubectl -n autolearnpro set image deployment/lms-api lms-api=ghcr.io/<owner>/lms-api:<sha>
- If using local uploads, mount `lms-api-uploads-pvc` at `/app/uploads` and update `Media` code to use the mount path.
- Prefer OIDC for GitHub Actions to authenticate to cluster; use short-lived service account tokens and RBAC.
- Tune resource requests/limits based on load testing and observability.
