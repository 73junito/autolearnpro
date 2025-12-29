# Quick Ollama Setup and Test
$ErrorActionPreference = "Stop"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Ollama Setup and Test for Question Generation" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

Write-Host "`n[1] Checking if Ollama is installed..." -ForegroundColor Yellow
$ollamaPath = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaPath) {
    Write-Host "  ✗ Ollama not found" -ForegroundColor Red
    Write-Host "`n  Install Ollama:" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://ollama.ai/" -ForegroundColor White
    Write-Host "  2. Or use winget: winget install Ollama.Ollama" -ForegroundColor White
    Write-Host "  3. Restart terminal after install" -ForegroundColor White
    exit 1
}
Write-Host "  ✓ Ollama found: $($ollamaPath.Source)" -ForegroundColor Green

Write-Host "`n[2] Checking if Ollama service is running..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  ✓ Ollama service is running" -ForegroundColor Green
}
catch {
    Write-Host "  ✗ Ollama service not running" -ForegroundColor Red
    Write-Host "`n  Starting Ollama..." -ForegroundColor Yellow
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Write-Host "  Waiting for service to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 5
        Write-Host "  ✓ Ollama service started" -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ Failed to start Ollama service" -ForegroundColor Red
        Write-Host "  Run manually: ollama serve" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "`n[3] Checking available models..." -ForegroundColor Yellow
$models = ollama list 2>&1 | Select-String -Pattern "^\w" | ForEach-Object { $_.Line.Split()[0] }
Write-Host "  Available models:" -ForegroundColor Cyan
foreach ($model in $models) {
    Write-Host "    - $model" -ForegroundColor White
}

$recommendedModels = @("llama3.1", "mistral", "llama3.1:8b")
$hasRecommended = $false
foreach ($rec in $recommendedModels) {
    if ($models -contains $rec) {
        Write-Host "`n  ✓ Recommended model '$rec' is available" -ForegroundColor Green
        $hasRecommended = $true
        $selectedModel = $rec
        break
    }
}

if (-not $hasRecommended) {
    Write-Host "`n  Pulling recommended model: llama3.1..." -ForegroundColor Yellow
    Write-Host "  This may take several minutes (4.7GB download)" -ForegroundColor Cyan
    ollama pull llama3.1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Model downloaded successfully" -ForegroundColor Green
        $selectedModel = "llama3.1"
    } else {
        Write-Host "  ✗ Failed to download model" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  Using model: $selectedModel" -ForegroundColor Cyan
}

Write-Host "`n[4] Testing model with sample question..." -ForegroundColor Yellow
$testPrompt = @"
You are an ASE-certified automotive technician. Create 1 multiple choice question about brake systems.

Return ONLY a JSON array:
[
  {
    "question_type": "multiple_choice",
    "question_text": "What component...",
    "question_data": {"options": ["A", "B", "C", "D"], "correct": 0},
    "difficulty": "medium",
    "topic": "Brake systems",
    "learning_objective": "Test understanding",
    "ase_standard": "A5.A.1",
    "points": 1,
    "explanation": "Explanation here",
    "reference_material": "ASE Guide",
    "correct_feedback": "Correct!",
    "incorrect_feedback": "Try again"
  }
]
"@

Write-Host "  Generating test question (this may take 10-30 seconds)..." -ForegroundColor Cyan
$testBody = @{
    model = $selectedModel
    prompt = $testPrompt
    stream = $false
} | ConvertTo-Json

try {
    $startTime = Get-Date
    $testResponse = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $testBody -ContentType "application/json" -TimeoutSec 120
    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    
    Write-Host "  ✓ Model responded in $([Math]::Round($elapsed, 1)) seconds" -ForegroundColor Green
    Write-Host "`n  Response preview:" -ForegroundColor Cyan
    $preview = $testResponse.response.Substring(0, [Math]::Min(500, $testResponse.response.Length))
    Write-Host "  $preview..." -ForegroundColor White
    
    # Try to parse JSON
    if ($testResponse.response -match '\[[\s\S]*\]') {
        $json = $Matches[0]
        try {
            $parsed = $json | ConvertFrom-Json
            Write-Host "`n  ✓ JSON parsed successfully" -ForegroundColor Green
            Write-Host "  Question: $($parsed[0].question_text)" -ForegroundColor Cyan
        }
        catch {
            Write-Host "`n  ⚠ JSON parse failed (may need prompt tuning)" -ForegroundColor Yellow
        }
    }
}
catch {
    Write-Host "  ✗ Model test failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n[5] Checking database connection..." -ForegroundColor Yellow
$pgPod = kubectl get pod -n autolearnpro -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Cannot connect to Postgres pod" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Connected to Postgres: $pgPod" -ForegroundColor Green

$count = kubectl exec -n autolearnpro $pgPod -- psql -U postgres -d lms_api_prod -t -c "SELECT COUNT(*) FROM questions;" 2>$null
Write-Host "  Current questions in database: $($count.Trim())" -ForegroundColor Cyan

Write-Host "`n=====================================================================" -ForegroundColor Green
Write-Host "  ✓ SETUP COMPLETE - Ready for Generation!" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green

Write-Host "`n  Quick Test (30 questions):" -ForegroundColor Yellow
Write-Host "    .\scripts\generate_200k_ollama.ps1 -TestMode" -ForegroundColor White

Write-Host "`n  Full Generation (200,000 questions - FREE!):" -ForegroundColor Yellow
Write-Host "    .\scripts\generate_200k_ollama.ps1" -ForegroundColor White

Write-Host "`n  Custom configuration:" -ForegroundColor Yellow
Write-Host "    .\scripts\generate_200k_ollama.ps1 -Model '$selectedModel' -TotalQuestions 50000" -ForegroundColor White

Write-Host "`n  Model: $selectedModel" -ForegroundColor Cyan
Write-Host "  Expected speed: 2-5 questions/minute (depending on hardware)" -ForegroundColor Cyan
Write-Host "  Cost: FREE (100% local)" -ForegroundColor Cyan
Write-Host "  Estimated time for 200K: 25-100 hours" -ForegroundColor Cyan
