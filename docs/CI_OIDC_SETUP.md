# CI/CD OIDC Setup Guide

This guide explains how to configure OpenID Connect (OIDC) authentication for the `publish-image.yml` workflow to deploy to Google GKE, AWS EKS, or Azure AKS without storing long-lived credentials.

## Overview

The workflow supports three authentication methods (in order of preference):

1. **Cloud OIDC** (recommended): GKE Workload Identity, AWS IRSA, or Azure Workload Identity Federation
2. **Base64 kubeconfig fallback**: Store a `KUBECONFIG_DATA` secret (use `scripts/set-kubeconfig-secret.sh`)

OIDC is more secure as it uses short-lived tokens and leverages GitHub's identity provider.

---

## Google Cloud (GKE) — Workload Identity Federation

### Prerequisites
- GKE cluster with Workload Identity enabled
- `gcloud` CLI installed and authenticated

### Steps

#### 1. Create a Workload Identity Pool and Provider

```bash
# Set variables
export PROJECT_ID="your-gcp-project-id"
export POOL_NAME="github-actions-pool"
export PROVIDER_NAME="github-actions-provider"
export REPO_OWNER="73junito"
export REPO_NAME="autolearnpro"

# Create Workload Identity Pool
gcloud iam workload-identity-pools create $POOL_NAME \
  --project=$PROJECT_ID \
  --location=global \
  --display-name="GitHub Actions Pool"

# Create OIDC provider
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=$POOL_NAME \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository_owner=='$REPO_OWNER'"
```

#### 2. Create a Service Account and Grant Permissions

```bash
export SERVICE_ACCOUNT_NAME="github-actions-deploy"
export SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Create service account
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --project=$PROJECT_ID \
  --display-name="GitHub Actions Deployment SA"

# Grant GKE permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/container.developer"

# Allow GitHub Actions to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${REPO_OWNER}/${REPO_NAME}"
```

#### 3. Set GitHub Repository Secrets

Navigate to your repository → Settings → Secrets and variables → Actions, and add:

| Secret Name | Value | Example |
|-------------|-------|---------|
| `GKE_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name | `projects/123456789/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider` |
| `GKE_SERVICE_ACCOUNT` | Service account email | `github-actions-deploy@your-project-id.iam.gserviceaccount.com` |
| `GKE_CLUSTER_NAME` | GKE cluster name | `autolearnpro-prod` |
| `GKE_CLUSTER_LOCATION` | GKE cluster location | `us-central1` or `us-central1-a` |

To get the full provider resource name:
```bash
gcloud iam workload-identity-pools providers describe $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=$POOL_NAME \
  --format="value(name)"
```

---

## Amazon Web Services (EKS) — IAM Roles for Service Accounts (IRSA)

### Prerequisites
- EKS cluster with OIDC provider enabled
- AWS CLI installed and configured
- `eksctl` or manual IAM setup

### Steps

#### 1. Create OIDC Identity Provider for GitHub Actions

```bash
# Set variables
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REPO_OWNER="73junito"
export REPO_NAME="autolearnpro"
export ROLE_NAME="GitHubActionsDeployRole"

# Create trust policy
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${REPO_OWNER}/${REPO_NAME}:*"
        }
      }
    }
  ]
}
EOF

# Create the OIDC provider (if not already exists)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  2>/dev/null || echo "OIDC provider already exists"

# Create IAM role
aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document file://trust-policy.json \
  --description "GitHub Actions role for EKS deployments"
```

#### 2. Attach EKS Permissions

```bash
# Create inline policy for EKS access
cat > eks-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:ListClusters"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name EKSAccess \
  --policy-document file://eks-policy.json

# Update EKS aws-auth ConfigMap to grant cluster access
# Replace with your cluster name and region
export CLUSTER_NAME="autolearnpro-prod"
export AWS_REGION="us-east-1"

kubectl -n kube-system get configmap aws-auth -o yaml > aws-auth.yaml

# Add this entry under mapRoles (adjust indentation):
# - rolearn: arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE_NAME}
#   username: github-actions-deploy
#   groups:
#     - system:masters

kubectl apply -f aws-auth.yaml
```

#### 3. Set GitHub Repository Secrets

| Secret Name | Value | Example |
|-------------|-------|---------|
| `AWS_ROLE_TO_ASSUME` | Full ARN of the IAM role | `arn:aws:iam::123456789012:role/GitHubActionsDeployRole` |
| `EKS_CLUSTER_NAME` | EKS cluster name | `autolearnpro-prod` |
| `AWS_REGION` | AWS region | `us-east-1` |

---

## Microsoft Azure (AKS) — Workload Identity Federation

### Prerequisites
- AKS cluster with Workload Identity enabled
- Azure CLI installed and authenticated

### Steps

#### 1. Register an Azure AD Application

```bash
# Set variables
export APP_NAME="github-actions-deploy"
export RESOURCE_GROUP="autolearnpro-rg"
export CLUSTER_NAME="autolearnpro-prod"
export SUBSCRIPTION_ID=$(az account show --query id -o tsv)
export REPO_OWNER="73junito"
export REPO_NAME="autolearnpro"

# Create Azure AD application
az ad app create --display-name $APP_NAME

export APP_ID=$(az ad app list --display-name $APP_NAME --query '[0].appId' -o tsv)

# Create service principal
az ad sp create --id $APP_ID

export SP_OBJECT_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query '[0].id' -o tsv)
```

#### 2. Configure Federated Identity Credential

```bash
cat > federated-identity.json <<EOF
{
  "name": "github-actions-federation",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${REPO_OWNER}/${REPO_NAME}:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF

az ad app federated-credential create \
  --id $APP_ID \
  --parameters federated-identity.json
```

For additional branch/environment protection, add more federated credentials:
```bash
# For all branches
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-actions-all-branches",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'${REPO_OWNER}'/'${REPO_NAME}':ref:refs/heads/*",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

#### 3. Grant AKS Permissions

```bash
# Get AKS resource ID
export AKS_ID=$(az aks show --resource-group $RESOURCE_GROUP --name $CLUSTER_NAME --query id -o tsv)

# Assign Azure Kubernetes Service Cluster User Role
az role assignment create \
  --assignee $APP_ID \
  --role "Azure Kubernetes Service Cluster User Role" \
  --scope $AKS_ID

# Optionally, grant Contributor role if needed for cluster management
az role assignment create \
  --assignee $APP_ID \
  --role "Contributor" \
  --scope $AKS_ID
```

#### 4. Set GitHub Repository Secrets

| Secret Name | Value | Example |
|-------------|-------|---------|
| `AZURE_CLIENT_ID` | Application (client) ID | `12345678-1234-1234-1234-123456789012` |
| `AZURE_TENANT_ID` | Directory (tenant) ID | `87654321-4321-4321-4321-210987654321` |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID | `abcdef12-3456-7890-abcd-ef1234567890` |
| `AKS_RESOURCE_GROUP` | AKS resource group | `autolearnpro-rg` |
| `AKS_CLUSTER_NAME` | AKS cluster name | `autolearnpro-prod` |

To retrieve these values:
```bash
echo "AZURE_CLIENT_ID: $APP_ID"
echo "AZURE_TENANT_ID: $(az account show --query tenantId -o tsv)"
echo "AZURE_SUBSCRIPTION_ID: $SUBSCRIPTION_ID"
```

---

## Fallback: Base64 Kubeconfig Method

If OIDC is not configured, the workflow falls back to the `KUBECONFIG_DATA` secret.

### Generate and Set Kubeconfig Secret

Use the provided helper script:

```bash
# For GKE
./scripts/set-kubeconfig-secret.sh

# Or manually encode your kubeconfig
cat ~/.kube/config | base64 -w 0
# Then set the output as KUBECONFIG_DATA secret in GitHub
```

---

## Troubleshooting

### Common Issues

**1. "failed to get credentials" or "permission denied"**
- Verify the service account/role has the correct permissions
- Check that the workload identity pool/provider is correctly configured
- Ensure the GitHub repo secret values are correct (no extra spaces)

**2. EKS: "You must be logged in to the server (Unauthorized)"**
- Update the `aws-auth` ConfigMap to include your IAM role
- Verify the role ARN matches what's in `AWS_ROLE_TO_ASSUME`

**3. AKS: "The client '...' does not have authorization"**
- Grant the app registration the appropriate RBAC role on the AKS cluster
- Check federated identity credential subject matches your repo/branch pattern

**4. Workflow uses fallback kubeconfig when OIDC is set**
- Check the `if:` conditions in the workflow steps
- Verify all required secrets for your cloud provider are set (not empty strings)
- Review workflow logs to see which authentication path was taken

### Verify OIDC Setup

**GKE:**
```bash
gcloud iam service-accounts get-iam-policy $SERVICE_ACCOUNT_EMAIL
```

**EKS:**
```bash
aws iam get-role --role-name $ROLE_NAME
aws iam get-role-policy --role-name $ROLE_NAME --policy-name EKSAccess
```

**AKS:**
```bash
az ad app federated-credential list --id $APP_ID
az role assignment list --assignee $APP_ID
```

---

## Security Best Practices

1. **Use separate service accounts/roles per environment** (dev, staging, prod)
2. **Restrict OIDC subject claims** to specific branches or environments:
   - GKE: Use `attribute.repository_owner` and `attribute.repository` filters
   - EKS: Use `token.actions.githubusercontent.com:sub` conditions
   - AKS: Use specific `subject` patterns in federated credentials
3. **Apply principle of least privilege** — grant only the permissions needed for deployment
4. **Rotate credentials regularly** if using fallback kubeconfig method
5. **Enable audit logging** on your Kubernetes clusters to track deployment activity

---

## Additional Resources

- [GitHub Actions OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [GKE Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [AWS IRSA Documentation](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
- [Azure Workload Identity Federation](https://learn.microsoft.com/en-us/azure/active-directory/workload-identities/workload-identity-federation)
