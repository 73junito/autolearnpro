CI deploy setup — KUBECONFIG vs OIDC

Goal

Ensure GitHub Actions can deploy to your Kubernetes cluster and run post-deploy tests. You have two safe options:

A) Short-lived OIDC / Workload Identity (recommended)
B) Encrypted kubeconfig secret `KUBECONFIG_DATA` (fall-back)

Option A — OIDC (recommended)

- GKE (Google Cloud): configure a Workload Identity Pool and allow the repository/workflow to impersonate a service account. Use `google-github-actions/auth` in workflows (see `.github/workflows/deploy-oidc-example.yml`).
- EKS (AWS): use `aws-actions/configure-aws-credentials` with `role-to-assume` via OIDC provider in IAM (see AWS docs).
- AKS (Azure): use `azure/login` with federated identity credentials.

Pros: no long-lived secrets in repo, auditable token issuance, simpler rotation.

Option B — KUBECONFIG_DATA (base64 kubeconfig)

If you need a quick setup or cannot configure OIDC yet, create a short-lived kubeconfig for a restricted service account and store it as a repo secret.

1) Create a minimal kubeconfig on your machine with a service account whose RBAC is limited to the `autolearnpro` namespace and only the required verbs (`get`, `list`, `watch`, `patch`, `update`, `create` for Jobs/ConfigMap as needed).

2) Base64-encode the kubeconfig and set the repo secret locally (recommended via GitHub CLI):

# macOS / Linux
KUBECONFIG_B64=$(base64 -w0 ~/.kube/deploy_kubeconfig)
# Windows PowerShell
# $b = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path $env:USERPROFILE + '\.kube\deploy_kubeconfig')))

# Using gh (recommended)
gh secret set KUBECONFIG_DATA --body "$KUBECONFIG_B64" --repo 73junito/autolearnpro

# Using curl (requires PAT)
curl -X PUT -H "Authorization: token <PAT>" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/73junito/autolearnpro/actions/secrets/KUBECONFIG_DATA \
  -d '{"encrypted_value":"<base64-encoded-kubeconfig>", "key_id":"<public-key-id>"}'

(See GitHub docs for encrypting secrets via repository public key; `gh secret set` wraps that for you.)

Safety notes

- Use a service account with minimal RBAC permissions. Do not use cluster-admin.
- Prefer OIDC where possible; document and rotate service accounts regularly.
- Ensure the workflow uses immutable image tags and test jobs run in a maintenance window or with appropriate timeouts.

Troubleshooting

- If the deploy job fails due to kubeconfig, verify the secret exists in Settings ? Secrets ? Actions.
- If OIDC auth fails, check provider configuration (Workload Identity Pool or IRSA) and that the workflow has `permissions: id-token: write`.

If you want, I can:
- Add a `scripts/set-kubeconfig-secret.sh` helper that uses `gh` to set the secret from a local file.
- Update `publish-image.yml` to prefer OIDC when available and fall back to `KUBECONFIG_DATA` automatically.  
