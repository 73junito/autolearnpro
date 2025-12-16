Deployment notes / checklist

- Use environment variables via Secret + ConfigMap / envFrom for runtime secrets. Example secret at `k8s/autolearnpro/secret-envfrom-example.yaml`.
- CI should update deployment image by SHA, not `latest`. Example:
  kubectl -n autolearnpro set image deployment/lms-api lms-api=ghcr.io/<owner>/lms-api:<sha>
- If using local uploads, mount `lms-api-uploads-pvc` at `/app/uploads` and update `Media` code to use the mount path.
- Prefer OIDC for GitHub Actions to authenticate to cluster; use short-lived service account tokens and RBAC.
- Tune resource requests/limits based on load testing and observability.


Cloudflare & ingress-nginx: notes & safety

This repository provides `k8s/autolearnpro/nginx-configmap.yaml` and `scripts/fetch-and-patch-cloudflare-ips.sh` to help configure `ingress-nginx` to trust Cloudflare IP ranges and correctly set the real client IP.

How the script works

- `scripts/fetch-and-patch-cloudflare-ips.sh` fetches the current Cloudflare IPv4/IPv6 lists and writes them into a small ConfigMap YAML that sets `set-real-ip-from` for the `ingress-nginx` controller.
- The script applies the patch via `kubectl apply -f` and triggers a rollout restart of the `ingress-nginx-controller` deployment (best-effort).

Recommended safe deployment steps

1. Test locally / in staging first
   - Run the script against your staging cluster or with a dry-run to verify the generated ConfigMap prior to applying it to production.
   - Example dry run: `./scripts/fetch-and-patch-cloudflare-ips.sh ingress-nginx nginx-configuration` and inspect the generated `/tmp/nginx-cm-patch.yaml` before `kubectl apply`.

2. Backup existing ConfigMap
   - Before applying, back up the current ConfigMap:
     `kubectl -n ingress-nginx get configmap nginx-configuration -o yaml > nginx-configuration.backup.yaml`

3. Least-privilege and RBAC
   - Run the script or CI job using a service account with minimal RBAC (ability to `get`, `apply` ConfigMap and `rollout restart` the specific deployment). Do NOT use a cluster-admin token in automation.

4. Apply during maintenance window
   - Restarting the ingress controller may briefly affect new connections. Apply and restart during low traffic or maintenance windows, or use a canary approach if you operate multiple controller replicas.

5. Validate after change
   - Confirm the ConfigMap has the expected `set-real-ip-from` entries: `kubectl -n ingress-nginx describe configmap nginx-configuration`.
   - Confirm the controller restarted and is healthy: `kubectl -n ingress-nginx rollout status deployment ingress-nginx-controller`.
   - Test app logs and health endpoint to verify `remote_ip` is now the client IP when requests come through Cloudflare.

6. Keep IP list up-to-date
   - Cloudflare may change ranges. Run the fetch-and-patch script on a schedule (nightly) in a CI job that runs with the appropriate minimal credentials, or run it manually when required.

Security considerations

- Header spoofing risk:
  - Only trust `CF-Connecting-IP` / `X-Forwarded-For` when they originate from Cloudflare IP ranges (the script configures `set-real-ip-from` to restrict this).
  - Do not enable `use-forwarded-headers` globally without restricting `set-real-ip-from`.

- Secrets & tokens:
  - The branch protection script (`scripts/set-branch-protection.sh`) and many automation scripts require a PAT. Store PATs in secure secret stores and avoid exposing them in logs.
  - For CI -> cluster auth prefer OIDC/workload federation over long-lived kubeconfig secrets.

- Audit & change control:
  - Record updates to the ingress ConfigMap in an audit log (CI job or Git commit) so changes are traceable.
  - Require code review for PRs that modify infrastructure manifests (we added `CODEOWNERS` and branch protection to help enforce this).

Operational checklist (quick)

- [ ] Backup existing `nginx-configuration` ConfigMap
- [ ] Run fetch-and-patch script in staging and validate
- [ ] Run fetch-and-patch script in production during maintenance window
- [ ] Verify controller rollout and app health
- [ ] Schedule nightly refresh of Cloudflare IP list (CI or cron)

If you want I can:
- Add a GitHub Actions workflow that runs `scripts/fetch-and-patch-cloudflare-ips.sh` nightly (requires a kubeconfig secret or OIDC-based job). I can prepare that next.
- Add an env guard to `CloudflareRemoteIp` plug (e.g., `TRUST_CF`) and tests.
