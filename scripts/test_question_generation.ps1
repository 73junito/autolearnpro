# ============================================================================
# Question Bank Test Script
# Generates a small sample to test the question generation system
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Question Bank Test - Generate 50 Sample Questions" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

function Get-PodName {
    $podName = kubectl get pod -n autolearnpro -l app=lms-api -o jsonpath='{.items[0].metadata.name}' 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to get LMS API pod name"
    }
    return $podName.Trim()
}

try {
    Write-Host "Step 1: Connecting to pod..." -ForegroundColor Cyan
    $podName = Get-PodName
    Write-Host "  ✓ Connected: $podName" -ForegroundColor Green
    
    Write-Host "`nStep 2: Checking current questions..." -ForegroundColor Cyan
    $result = kubectl exec -n autolearnpro $podName -- /app/bin/lms_api eval 'LmsApi.Repo.query!("SELECT COUNT(*) FROM questions", [])' 2>&1
    Write-Host "  $result" -ForegroundColor Yellow
    
    Write-Host "`nStep 3: Generating 10 EV questions (medium difficulty)..." -ForegroundColor Cyan
    Write-Host "  Executing generation..." -ForegroundColor Yellow
    
    kubectl exec -n autolearnpro $podName -- /app/bin/lms_api eval @'
alias LmsApi.QuestionBankManager
{:ok, questions} = QuestionBankManager.generate_bulk_questions("ev", "medium", 10, ase_standards: ["L3.A.1", "L3.A.2", "L3.B.1"])
IO.puts("Generated: #{length(questions)} questions")
questions
'@
    
    Write-Host "`nStep 4: Checking for duplicates..." -ForegroundColor Cyan
    
    kubectl exec -n autolearnpro $podName -- /app/bin/lms_api eval @'
alias LmsApi.QuestionBankManager
{unique, dupes} = QuestionBankManager.check_for_duplicates(questions)
IO.puts("Unique: #{length(unique)}, Duplicates: #{length(dupes)}")
unique
'@
    
    Write-Host "`nStep 5: Inserting into database..." -ForegroundColor Cyan
    
    kubectl exec -n autolearnpro $podName -- /app/bin/lms_api eval @'
alias LmsApi.QuestionBankManager
{:ok, count} = QuestionBankManager.insert_questions(unique, "ev", "medium")
IO.puts("Inserted: #{count} questions")
'@
    
    Write-Host "`nStep 6: Getting statistics..." -ForegroundColor Cyan
    
    kubectl exec -n autolearnpro $podName -- /app/bin/lms_api eval @'
alias LmsApi.QuestionBankManager
stats = QuestionBankManager.get_question_stats()
Enum.each(stats, fn s -> IO.puts("  #{s.category} (#{s.difficulty}): #{s.count} questions") end)
'@
    
    Write-Host "`nStep 7: Viewing sample question..." -ForegroundColor Cyan
    
    kubectl exec -n autolearnpro $podName -- /app/bin/lms_api eval @'
result = LmsApi.Repo.query!("SELECT question_text, question_type, difficulty, topic FROM questions LIMIT 1", [])
case result.rows do
  [[text, type, diff, topic]] ->
    IO.puts("Question Type: #{type}")
    IO.puts("Difficulty: #{diff}")
    IO.puts("Topic: #{topic}")
    IO.puts("Text: #{text}")
  _ ->
    IO.puts("No questions found")
end
'@
    
    Write-Host "`n✓ Test completed successfully!" -ForegroundColor Green
    Write-Host "  Ready to run full expansion with expand_question_bank.ps1" -ForegroundColor Yellow
    
} catch {
    Write-Host "`n✗ Error: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
}
