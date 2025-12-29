# Test Question Bank Generation System
$ErrorActionPreference = "Stop"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "  Question Bank Test - Verify Generation Pipeline" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

$pod = "lms-api-89d64dbfc-gjskk"

Write-Host "`n[1] Checking database connection..." -ForegroundColor Cyan
$result = kubectl exec -n autolearnpro $pod -- /app/bin/lms_api rpc 'LmsApi.Repo.query!("SELECT COUNT(*) as count FROM questions", [])'
Write-Host "  Current questions: $result" -ForegroundColor Yellow

Write-Host "`n[2] Testing QuestionBankManager module..." -ForegroundColor Cyan
Write-Host "  Generating 5 test questions..." -ForegroundColor Yellow

$genScript = @'
alias LmsApi.QuestionBankManager
case QuestionBankManager.generate_bulk_questions("ev", "medium", 5, ase_standards: ["L3.A.1"]) do
  {:ok, questions} ->
    IO.puts("SUCCESS: Generated #{length(questions)} questions")
    {unique, dupes} = QuestionBankManager.check_for_duplicates(questions)
    IO.puts("Unique: #{length(unique)}, Duplicates: #{length(dupes)}")
    
    {:ok, count} = QuestionBankManager.insert_questions(unique, "ev", "medium")
    IO.puts("Inserted: #{count} questions")
    
  {:error, reason} ->
    IO.puts("ERROR: #{inspect(reason)}")
end
'@

kubectl exec -n autolearnpro $pod -- /app/bin/lms_api rpc $genScript

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[3] Checking updated count..." -ForegroundColor Cyan
    $newResult = kubectl exec -n autolearnpro $pod -- /app/bin/lms_api rpc 'LmsApi.Repo.query!("SELECT COUNT(*) FROM questions", [])'
    Write-Host "  New total: $newResult" -ForegroundColor Green
    
    Write-Host "`n[4] Viewing sample question..." -ForegroundColor Cyan
    kubectl exec -n autolearnpro $pod -- /app/bin/lms_api rpc 'result = LmsApi.Repo.query!("SELECT question_text, question_type, difficulty FROM questions LIMIT 1", []); case result.rows do [[text, type, diff]] -> IO.puts("Type: #{type}, Difficulty: #{diff}\nQuestion: #{text}"); _ -> IO.puts("No questions") end'
    
    Write-Host "`n==========================================================================" -ForegroundColor Green
    Write-Host "  ✓ TEST PASSED - System is working!" -ForegroundColor Green
    Write-Host "==========================================================================" -ForegroundColor Green
    Write-Host "`nReady for full expansion:" -ForegroundColor Yellow
    Write-Host "  Run: .\scripts\expand_question_bank_rpc.ps1" -ForegroundColor White
    
} else {
    Write-Host "`n✗ Test failed" -ForegroundColor Red
    exit 1
}
