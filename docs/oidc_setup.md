OIDC / Workload Identity setup — immediate steps

Goal

Enable GitHub Actions to authenticate to your Kubernetes cluster using OIDC (recommended) or set a short-lived kubeconfig secret (fallback). This document has immediate actionable steps for GKE, EKS, and AKS plus how to trigger CI deploys.

High-level options
- GKE: Workload Identity Federation ? `google-github-actions/auth`
- EKS: IRSA / OIDC provider ? `aws-actions/configure-aws-credentials` + `aws eks update-kubeconfig`
- AKS: Federated identity (Azure AD) ? `azure/login` with federated credentials

Immediate steps (pick the provider you use)

1) GKE (recommended)
- Create a Workload Identity Pool and Provider in GCP and add a federated credential that trusts GitHub repo/workflows.
- Bind a GCP service account to the Workload Identity Provider and grant the service account `roles/container.admin` (or narrower rights) and `roles/iam.serviceAccountTokenCreator` as needed.
- In GitHub repository Secrets, set:
  - `GKE_WORKLOAD_IDENTITY_PROVIDER` = projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER
  - `GKE_SERVICE_ACCOUNT` = svc-account@PROJECT_ID.iam.gserviceaccount.com
  - `GKE_CLUSTER_NAME`, `GKE_CLUSTER_LOCATION`
- The workflow `publish-image.yml` already contains conditional steps which will use these secrets when present. To test: run a workflow dispatch on `publish-image.yml`.

2) EKS (IRSA)
- Create an IAM OIDC provider for your EKS cluster (if not already present): `eksctl utils associate-iam-oidc-provider` or via AWS Console.
- Create an IAM role with a trust policy that allows GitHub OIDC (your repo/organization) to assume the role, and attach minimal permissions (e.g., `AmazonEKSClusterPolicy` plus permissions to update kubeconfig and patch deployments in the `autolearnpro` namespace).
- In GitHub repository Secrets, set:
  - `AWS_ROLE_TO_ASSUME` = arn:aws:iam::ACCOUNT_ID:role/GitHubActionsOidcRole
  - `AWS_REGION` = your region (e.g., us-west-2)
  - `EKS_CLUSTER_NAME` = your cluster name
- Use the provided example workflow `.github/workflows/deploy-eks-oidc-example.yml` to test (it will use the above secrets).

3) AKS (Azure)
- Create an Azure AD application and add a federated credential trusting GitHub Actions (or configure Workload Identity for AKS if supported in your environment).
- Grant the app role assignment with minimal RBAC to your AKS cluster.
- Add the following repo secrets:
  - `AZURE_CLIENT_ID`
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID` (if required)
  - Additional workflow config depends on how you register the federated credential.
- Because AKS federated steps vary by tenant, follow Microsoft docs for 'Configure federated identity credentials for GitHub Actions'.

Fallback — KUBECONFIG_DATA (short-lived kubeconfig)
- Create a service account in the cluster scoped to `autolearnpro` with minimal RBAC.
- Generate a kubeconfig for that SA and base64-encode it: `base64 -w0 deploy_kubeconfig`
- Use `./scripts/set-kubeconfig-secret.sh /path/to/deploy_kubeconfig` to set `KUBECONFIG_DATA` in the repo secrets (requires `gh` CLI authenticated).
- `publish-image.yml` will fall back to decoding `KUBECONFIG_DATA` when OIDC secrets aren't present.

Triggering CI deploy (once secrets are set)
- Push a commit or create a workflow dispatch for `publish-image.yml` (Actions ? Workflows ? publish-image -> Run workflow).
- After the run completes, open the workflow run and download the artifact named `service-tests-<sha>` to inspect post-deploy connectivity logs.

Verification checklist
- [ ] OIDC secrets added to repository
- [ ] Ingress, ConfigMap and NetworkPolicy applied in cluster
- [ ] `TRUST_CF` set to `true` in deployment (or via env from ConfigMap/Secret)
- [ ] Run `publish-image.yml` and inspect `service-tests` artifact

If you want I can:
- Add the EKS example workflow (I have added `.github/workflows/deploy-eks-oidc-example.yml` in this repo) and a small AKS guide.
- Optionally create a short PR that toggles `TRUST_CF=true` in a staging manifest and applies ingress changes (requires kube creds).
