# Build and deploy lms-api locally (Docker Desktop)
# Usage: .\scripts\build_and_deploy_lms_api.ps1

param(
    [string]$Image = 'autolearnpro/lms-api:local',
    [string]$Dockerfile = 'docker/lms-api/Dockerfile.release',
    [string]$Namespace = 'autolearnpro',
    [string]$Deployment = 'lms-api',
    [int]$MigrateTimeoutSec = 300
)

Write-Host "Building image $Image using $Dockerfile"
docker build -t $Image -f $Dockerfile .
if ($LASTEXITCODE -ne 0) { Write-Error "Docker build failed"; exit 1 }

Write-Host "Updating deployment $Deployment in namespace $Namespace to image $Image"
kubectl set image deployment/$Deployment $Deployment=$Image -n $Namespace
if ($LASTEXITCODE -ne 0) { Write-Error "kubectl set image failed"; exit 1 }

Write-Host "Waiting for rollout to complete..."
kubectl rollout status deployment/$Deployment -n $Namespace
if ($LASTEXITCODE -ne 0) { Write-Error "rollout failed or timed out"; exit 1 }

Write-Host "Applying migrate Job manifest (k8s/lms-api-migrate-job.yaml)"
kubectl apply -f k8s/lms-api-migrate-job.yaml
if ($LASTEXITCODE -ne 0) { Write-Error "kubectl apply failed"; exit 1 }

Write-Host "Waiting for migrate job to complete (timeout ${MigrateTimeoutSec}s)"
kubectl wait --for=condition=complete job/lms-api-migrate -n $Namespace --timeout=${MigrateTimeoutSec}s
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Migration job did not complete successfully within timeout. Check logs: kubectl logs job/lms-api-migrate -n $Namespace"
    exit 1
}

Write-Host "Deployment and migration completed. Check pod status with: kubectl get pods -n $Namespace"
exit 0
