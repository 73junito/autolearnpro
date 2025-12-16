# autolearnpro

Automotive & Diesel LMS — backend + frontend for learning management and adaptive content.

This repository contains the LMS API (Elixir/Phoenix), frontend, deployment manifests, and CI workflows.

## Quick Start

### CI/CD & Deployment

The GitHub Actions workflow `.github/workflows/publish-image.yml` builds and deploys the LMS API container image to Kubernetes.

**Authentication Options:**
- **OIDC (recommended)**: Configure GKE Workload Identity, AWS IRSA, or Azure Workload Identity Federation for secure, short-lived token authentication
- **Fallback**: Use base64-encoded `KUBECONFIG_DATA` secret

See **[docs/CI_OIDC_SETUP.md](docs/CI_OIDC_SETUP.md)** for detailed setup instructions for each cloud provider.

## License

This project is licensed under the MIT License — see `LICENSE` for details.

## Contributing

Please follow the PR template and ensure CI checks pass. See `docs/debugging_policy.md` for privacy and debugging rules.