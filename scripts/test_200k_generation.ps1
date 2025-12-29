# Test 200K Question Generation System
# Generates 30 questions (10 of each type) to verify pipeline

param(
    [string]$OpenAIKey = $env:OPENAI_API_KEY
)

if (-not $OpenAIKey) {
    Write-Host "Error: Set OPENAI_API_KEY environment variable" -ForegroundColor Red
    exit 1
}

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Testing 200K Question Generation Pipeline" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

Write-Host "`n[1] Testing OpenAI API connection..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $OpenAIKey"
    "Content-Type" = "application/json"
}
$testBody = @{
    model = "gpt-4o"
    messages = @(@{role = "user"; content = "Reply with: OK"})
    max_tokens = 10
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.openai.com/v1/chat/completions" -Method Post -Headers $headers -Body $testBody
    Write-Host "  ✓ OpenAI API connected" -ForegroundColor Green
}
catch {
    Write-Host "  ✗ OpenAI API error: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2] Testing database connection..." -ForegroundColor Yellow
$pgPod = kubectl get pod -n autolearnpro -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Failed to get Postgres pod" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Connected to: $pgPod" -ForegroundColor Green

$count = kubectl exec -n autolearnpro $pgPod -- psql -U postgres -d lms_api_prod -t -c "SELECT COUNT(*) FROM questions;" 2>$null
Write-Host "  Current questions: $($count.Trim())" -ForegroundColor Cyan

Write-Host "`n[3] Running test generation (10 questions per type)..." -ForegroundColor Yellow
Write-Host "  This will generate 30 total questions" -ForegroundColor Cyan

.\scripts\generate_200k_questions.ps1 -TotalQuestions 30 -BatchSize 10 -OpenAIKey $OpenAIKey

Write-Host "`n✓ Test complete! Review the log file for details." -ForegroundColor Green
Write-Host "`nTo generate full 200K:" -ForegroundColor Yellow
Write-Host "  .\scripts\generate_200k_questions.ps1" -ForegroundColor White
Write-Host "`nEstimated time: 40-60 hours" -ForegroundColor Yellow
Write-Host "Estimated cost: `$300-500 (GPT-4o pricing)" -ForegroundColor Yellow
