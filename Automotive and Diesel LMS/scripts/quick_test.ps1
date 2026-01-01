# Simple test script for question generation
$ErrorActionPreference = "Stop"

Write-Host "Testing Question Generation System..." -ForegroundColor Cyan

$pod = kubectl get pod -n autolearnpro -l app=lms-api -o jsonpath='{.items[0].metadata.name}'
Write-Host "Pod: $pod" -ForegroundColor Yellow

Write-Host "`n1. Check current question count..." -ForegroundColor Cyan
kubectl exec -n autolearnpro $pod -- /app/bin/lms_api eval 'LmsApi.Repo.query!("SELECT COUNT(*) FROM questions", [])'

Write-Host "`n2. Generate 5 test questions..." -ForegroundColor Cyan
kubectl exec -n autolearnpro $pod -- /app/bin/lms_api eval 'alias LmsApi.QuestionBankManager; {:ok, q} = QuestionBankManager.generate_bulk_questions("ev", "medium", 5); IO.puts("Generated: #{length(q)}"); q' | Select-String -Pattern "Generated"

Write-Host "`n✓ Test complete!" -ForegroundColor Green
Write-Host "Ready to run: .\scripts\expand_question_bank.ps1" -ForegroundColor Yellow
