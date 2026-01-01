# Simple test of Ollama question generation
param(
    [string]$Model = "llama3.1:8b"
)

Write-Host "Testing Ollama question generation..." -ForegroundColor Cyan

$prompt = @"
You are an ASE-certified automotive technician creating 1 assessment questions.

CATEGORY: brakes
TYPE: multiple_choice
DIFFICULTY: medium
ASE STANDARDS: A5.A.1, A5.B.2

Multiple Choice: 4 options (A-D), one correct. JSON format: {"options": ["A", "B", "C", "D"], "correct": 0}

Create 1 questions. Return ONLY a JSON array (no explanation):
[
  {
    "question_type": "multiple_choice",
    "question_text": "What is the purpose of...",
    "question_data": {...},
    "difficulty": "medium",
    "topic": "Specific topic",
    "learning_objective": "Assess understanding of...",
    "ase_standard": "A5.A.1",
    "points": 1,
    "explanation": "Detailed explanation why answer is correct",
    "reference_material": "ASE Study Guide",
    "correct_feedback": "Correct! Additional insight",
    "incorrect_feedback": "Review this concept"
  }
]

IMPORTANT: Return ONLY the JSON array. No other text.
"@

$body = @{
    model = $Model
    prompt = $prompt
    stream = $false
    options = @{
        temperature = 0.8
    }
} | ConvertTo-Json -Depth 10

Write-Host "`nCalling Ollama API..." -ForegroundColor Yellow
Write-Host "Model: $Model" -ForegroundColor Gray
Write-Host "URL: http://localhost:11434/api/generate" -ForegroundColor Gray

try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 180
    $sw.Stop()
    
    Write-Host "`n✓ Response received in $($sw.Elapsed.TotalSeconds) seconds" -ForegroundColor Green
    Write-Host "Response length: $($response.response.Length) characters" -ForegroundColor Gray
    
    # Show first 500 chars
    Write-Host "`n--- Response Preview (first 500 chars) ---" -ForegroundColor Cyan
    Write-Host $response.response.Substring(0, [Math]::Min(500, $response.response.Length))
    
    # Try to extract JSON
    Write-Host "`n--- Extracting JSON ---" -ForegroundColor Cyan
    $cleaned = $response.response -replace '```json\s*', '' -replace '```\s*', ''
    $cleaned = $cleaned.Trim()
    
    if ($cleaned -match '(\[[\s\S]*?\])') {
        $json = $Matches[1]
        Write-Host "✓ Found JSON array: $($json.Length) characters" -ForegroundColor Green
        
        # Parse JSON
        Write-Host "`n--- Parsing JSON ---" -ForegroundColor Cyan
        try {
            $questions = $json | ConvertFrom-Json
            
            if ($questions -is [array]) {
                Write-Host "✓ Parsed as array: $($questions.Count) questions" -ForegroundColor Green
            } else {
                Write-Host "✓ Parsed as single object, wrapping in array" -ForegroundColor Yellow
                $questions = @($questions)
            }
            
            # Show first question
            Write-Host "`n--- First Question ---" -ForegroundColor Cyan
            Write-Host "Type: $($questions[0].question_type)" -ForegroundColor Gray
            Write-Host "Difficulty: $($questions[0].difficulty)" -ForegroundColor Gray
            Write-Host "Question: $($questions[0].question_text)" -ForegroundColor White
            Write-Host "Topic: $($questions[0].topic)" -ForegroundColor Gray
            Write-Host "ASE Standard: $($questions[0].ase_standard)" -ForegroundColor Gray
            Write-Host "`nQuestion Data (JSON):" -ForegroundColor Gray
            Write-Host ($questions[0].question_data | ConvertTo-Json)
            
            Write-Host "`n✓ SUCCESS: Question generation working!" -ForegroundColor Green
        }
        catch {
            Write-Host "✗ JSON parse error: $_" -ForegroundColor Red
            Write-Host "`nJSON content:" -ForegroundColor Yellow
            Write-Host $json
        }
    } else {
        Write-Host "✗ No JSON array found in response" -ForegroundColor Red
    }
}
catch {
    Write-Host "`n✗ Ollama API Error: $_" -ForegroundColor Red
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Yellow
}
