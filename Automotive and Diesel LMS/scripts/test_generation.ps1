# Test Question Generation via Elixir Script
$ErrorActionPreference = "Stop"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Testing Question Generation (30 questions)" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

$pod = "lms-api-89d64dbfc-gjskk"

Write-Host "`nStep 1: Copying script to pod..." -ForegroundColor Cyan
kubectl cp backend\lms_api\priv\repo\generate_questions.exs autolearnpro/${pod}:/tmp/generate_questions.exs
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to copy script" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Script copied" -ForegroundColor Green

Write-Host "`nStep 2: Running generation script..." -ForegroundColor Cyan
kubectl exec -n autolearnpro $pod -- mix run /tmp/generate_questions.exs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Test completed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n✗ Test failed" -ForegroundColor Red
    exit 1
}
