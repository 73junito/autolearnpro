Deploy & CI instructions

This document explains how to publish the backend image to GitHub Container Registry (GHCR), add the required Kubernetes secret for CI-based deploy, trigger the workflow, and run the idempotent smoke test.

Overview

- The Actions workflow `publish-image.yml` builds and pushes `ghcr.io/<owner>/lms-api:latest` and `:<sha>`.
- I added a `deploy` job that runs after the build and push. The deploy job decodes a base64-encoded kubeconfig from the repository secret `KUBECONFIG_DATA` and runs `kubectl` to update the `lms-api` deployment in namespace `autolearnpro`.

Add `KUBECONFIG_DATA` secret

1. Create a base64-encoded version of your kubeconfig and add it to the repo secrets as `KUBECONFIG_DATA`.

PowerShell (Windows):

```
# $k = Get-Content $env:USERPROFILE\.kube\config -Raw
# $b = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($k))
# Write-Output $b | clip
```

macOS / Linux:

```
base64 -w0 ~/.kube/config | pbcopy   # macOS (pbcopy)
base64 -w0 ~/.kube/config > /tmp/kubeconfig.b64
cat /tmp/kubeconfig.b64
```

Then in GitHub: Repository -> Settings -> Secrets -> Actions -> New repository secret
- Name: `KUBECONFIG_DATA`
- Value: paste the base64 string

Notes:
- The secret must be able to authenticate the workflow runner to your cluster. Use a service account kubeconfig with appropriate RBAC (ability to `set image` and wait rollouts in `autolearnpro`).

Trigger the workflow

- Manual: Go to Actions → `Build and publish Docker image to GHCR` (or the `publish-image.yml` run) and click `Run workflow` / select branch `k8s/env-from-health` or run on `ci/add-deploy` if desired.
- Automatic: Push to `main`, `master`, or any branch under `k8s/**` (workflow triggers on those). The `deploy` job runs only when a kubeconfig secret exists.

Verify GHCR image

After the `build-and-push` step completes, the workflow tags the image as `ghcr.io/<owner>/lms-api:latest`.

To verify locally (optional):

```
# attempt to pull (if private, authenticate first)
docker pull ghcr.io/<owner>/lms-api:latest
# or list package versions via GitHub API or 'gh' CLI
```

Manual deploy (if you prefer not to wait for CI)

If the image is already in GHCR, or you have a local image on the node, you can update the deployment manually:

```
kubectl -n autolearnpro set image deployment/lms-api lms-api=ghcr.io/73junito/lms-api:latest
kubectl -n autolearnpro rollout status deployment/lms-api --timeout=300s
kubectl -n autolearnpro get pods -o wide --show-labels
```

If you're using a local image (only on the node that runs the cluster), set it to the local tag:

```
kubectl -n autolearnpro set image deployment/lms-api lms-api=autolearnpro/lms-api:long-term-fix-health
kubectl -n autolearnpro rollout status deployment/lms-api --timeout=300s
```

Run the idempotent smoke test

The repo includes `k8s/autolearnpro/09-smoke-test-idempotent.yaml`. To run and fetch logs:

```
kubectl -n autolearnpro delete job smoke-test-idempotent --ignore-not-found
kubectl -n autolearnpro apply -f k8s/autolearnpro/09-smoke-test-idempotent.yaml
kubectl -n autolearnpro wait --for=condition=complete job/smoke-test-idempotent --timeout=300s
kubectl -n autolearnpro logs -l job-name=smoke-test-idempotent --tail=200
```

Expected output lines in logs (idempotent behavior):

- `Register HTTP code: 422` if the user already exists (idempotent)
- `Login HTTP code: 200` on successful login

Use the local automation script (optional)

You can run the helper script `scripts/automate-ci-deploy.ps1` to programmatically dispatch the workflow, poll it, update k8s, and run smoke tests. It requires a short-lived GitHub PAT to trigger the workflow via API (scope: `repo` and `workflow` / `workflow_dispatch`).

Example:

```
.\scripts\automate-ci-deploy.ps1 -GitHubToken <PAT> -RepoOwner 73junito -Repo autolearnpro -Branch k8s/env-from-health -ImageTag latest
```

Optional improvements

- Store an OIDC-based deploy job that uses workload identity instead of a long-lived kubeconfig secret.
- Add a post-publish smoke test step to the workflow to run the smoke job in-cluster automatically after deploy.
- Consider converting large repo assets to Git LFS or remove them from history to avoid `git push` rejections.

---

If you want, I can:
- open a PR description for `ci/add-deploy` with these notes, or
- trigger the workflow via API if you provide a short-lived PAT.
