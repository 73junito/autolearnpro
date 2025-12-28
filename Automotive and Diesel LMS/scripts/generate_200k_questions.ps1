# ============================================================================
# Massive Question Bank Expansion - 200,000 Questions
# Standalone script using OpenAI API + Direct SQL insertion
# ============================================================================

param(
    [int]$TotalQuestions = 200000,
    [string]$OpenAIKey = $env:OPENAI_API_KEY,
    [int]$BatchSize = 50,
    [int]$MaxConcurrent = 5,
    [switch]$Resume = $false,
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

if (-not $OpenAIKey) {
    Write-Host "Error: OPENAI_API_KEY environment variable not set" -ForegroundColor Red
    exit 1
}

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  MASSIVE QUESTION BANK EXPANSION - $TotalQuestions Questions" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$distribution = @{
    categories = @{
        "ev" = 0.25              # 50,000 questions
        "diesel" = 0.20          # 40,000 questions
        "engine_performance" = 0.20  # 40,000 questions
        "electrical" = 0.20      # 40,000 questions
        "brakes" = 0.15          # 30,000 questions
    }
    question_types = @{
        "multiple_choice" = 0.40  # 80,000 questions
        "true_false" = 0.35       # 70,000 questions
        "fill_blank" = 0.25       # 50,000 questions
    }
    difficulties = @{
        "easy" = 0.30
        "medium" = 0.50
        "hard" = 0.20
    }
}

$ase_standards = @{
    "ev" = @("L3.A.1", "L3.A.2", "L3.A.3", "L3.B.1", "L3.B.2", "L3.C.1")
    "diesel" = @("T2.A.1", "T2.A.2", "T2.B.1", "T2.C.1", "T2.D.1", "T2.E.1")
    "engine_performance" = @("A8.A.1", "A8.A.2", "A8.B.1", "A8.C.1", "A8.D.1", "A8.E.1")
    "brakes" = @("A5.A.1", "A5.A.2", "A5.B.1", "A5.C.1", "A5.D.1", "A5.E.1")
    "electrical" = @("A6.A.1", "A6.A.2", "A6.B.1", "A6.C.1", "A6.D.1", "A6.E.1")
}

# Progress tracking
$progressFile = ".\scripts\.question_progress.json"
$logFile = ".\scripts\question_generation_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMsg = "[$timestamp] [$Level] $Message"
    Add-Content -Path $logFile -Value $logMsg
    
    switch ($Level) {
        "ERROR" { Write-Host $Message -ForegroundColor Red }
        "WARN" { Write-Host $Message -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $Message -ForegroundColor Green }
        default { Write-Host $Message -ForegroundColor White }
    }
}

function Get-Progress {
    if (Test-Path $progressFile) {
        return Get-Content $progressFile | ConvertFrom-Json
    }
    return @{
        total_generated = 0
        by_category = @{}
        by_type = @{}
        by_difficulty = @{}
        failed_batches = @()
        start_time = (Get-Date).ToString("o")
    }
}

function Save-Progress {
    param($Progress)
    $Progress | ConvertTo-Json -Depth 10 | Set-Content $progressFile
}

function Invoke-OpenAI {
    param(
        [string]$Prompt,
        [string]$Model = "gpt-4o",
        [int]$MaxTokens = 4000
    )
    
    $headers = @{
        "Authorization" = "Bearer $OpenAIKey"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        model = $Model
        messages = @(
            @{
                role = "system"
                content = "You are an ASE-certified Master Automotive Technician creating high-quality assessment questions. Return only valid JSON arrays, no markdown formatting."
            },
            @{
                role = "user"
                content = $Prompt
            }
        )
        temperature = 0.8
        max_tokens = $MaxTokens
    } | ConvertTo-Json -Depth 10
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.openai.com/v1/chat/completions" -Method Post -Headers $headers -Body $body
        return $response.choices[0].message.content
    }
    catch {
        Write-Log "OpenAI API Error: $_" "ERROR"
        return $null
    }
}

function Generate-QuestionBatch {
    param(
        [string]$Category,
        [string]$QuestionType,
        [string]$Difficulty,
        [int]$Count,
        [array]$AseStandards
    )
    
    $aseList = $AseStandards -join ", "
    
    $typeInstructions = switch ($QuestionType) {
        "multiple_choice" {
            @"
Multiple Choice Format:
- Provide 4 options (A, B, C, D)
- Only ONE correct answer
- All distractors must be plausible
- No "all of the above" or "none of the above"
JSON: {"options": ["A", "B", "C", "D"], "correct": 0}
"@
        }
        "true_false" {
            @"
True/False Format:
- Clear, unambiguous statement
- Definitely true or definitely false
- No trick questions or edge cases
JSON: {"correct": true} or {"correct": false}
"@
        }
        "fill_blank" {
            @"
Fill in the Blank Format:
- 1-3 blanks in a technical statement
- Specific technical terms required
- Accept multiple valid spellings/variations
JSON: {"blanks": ["answer1", "answer2"], "case_sensitive": false, "acceptable_variations": ["alt1", "alt2"]}
"@
        }
    }
    
    $prompt = @"
Create $Count high-quality $QuestionType questions for automotive technicians.

Category: $Category
Difficulty: $Difficulty
ASE Standards: $aseList

$typeInstructions

Requirements:
1. Industry-standard terminology
2. Real diagnostic scenarios
3. Current vehicle technology (2020+)
4. ASE certification level content
5. Vary specific topics within category
6. Include hybrid/EV content where relevant

Difficulty Guidelines:
- Easy: Basic definitions, recall, simple procedures
- Medium: Application, diagnosis, multi-step procedures
- Hard: Complex diagnostics, calculations, advanced theory

Return ONLY a JSON array (no markdown):
[
  {
    "question_type": "$QuestionType",
    "question_text": "Technical question here...",
    "question_data": {...},
    "difficulty": "$Difficulty",
    "topic": "Specific technical topic",
    "learning_objective": "What this assesses",
    "ase_standard": "X.X.X or null",
    "points": 1,
    "explanation": "Why answer is correct with technical details",
    "reference_material": "ASE guide or technical source",
    "correct_feedback": "Correct! Additional learning point",
    "incorrect_feedback": "Review this concept and try again"
  }
]
"@
    
    $response = Invoke-OpenAI -Prompt $prompt -MaxTokens 4000
    if (-not $response) {
        return $null
    }
    
    # Clean response
    $json = $response -replace '```json\s*', '' -replace '```\s*', '' | Out-String
    $json = $json.Trim()
    
    try {
        $questions = $json | ConvertFrom-Json
        if ($questions -is [array]) {
            return $questions
        }
        Write-Log "Response is not an array" "WARN"
        return $null
    }
    catch {
        Write-Log "JSON parse error: $_" "ERROR"
        Write-Log "Response preview: $($json.Substring(0, [Math]::Min(500, $json.Length)))" "ERROR"
        return $null
    }
}

function Get-PostgresConnection {
    $pod = kubectl get pod -n autolearnpro -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to get Postgres pod"
    }
    return $pod.Trim()
}

function Get-OrCreate-QuestionBank {
    param(
        [string]$Category,
        [string]$Difficulty,
        [string]$PgPod
    )
    
    $name = "$($Category.ToUpper()) - $($Difficulty.ToUpper())"
    
    # Check if exists
    $checkSql = "SELECT id FROM question_banks WHERE name = '$name' LIMIT 1;"
    $result = kubectl exec -n autolearnpro $PgPod -- psql -U postgres -d lms_api_prod -t -c $checkSql 2>$null
    
    if ($result -and $result.Trim()) {
        return $result.Trim()
    }
    
    # Create new
    $insertSql = @"
INSERT INTO question_banks (name, description, category, difficulty, inserted_at, updated_at)
VALUES ('$name', 'Questions for $category at $difficulty level', '$category', '$difficulty', NOW(), NOW())
RETURNING id;
"@
    
    $result = kubectl exec -n autolearnpro $PgPod -- psql -U postgres -d lms_api_prod -t -c $insertSql 2>$null
    return $result.Trim()
}

function Insert-Questions {
    param(
        [array]$Questions,
        [int]$BankId,
        [string]$Category,
        [string]$PgPod
    )
    
    $inserted = 0
    $failed = 0
    
    foreach ($q in $Questions) {
        # Escape single quotes for SQL
        $questionText = $q.question_text -replace "'", "''"
        $topic = ($q.topic -replace "'", "''").Substring(0, [Math]::Min(200, $q.topic.Length))
        $learningObj = ($q.learning_objective -replace "'", "''").Substring(0, [Math]::Min(500, $q.learning_objective.Length))
        $explanation = ($q.explanation -replace "'", "''").Substring(0, [Math]::Min(5000, $q.explanation.Length))
        $refMaterial = ($q.reference_material -replace "'", "''").Substring(0, [Math]::Min(500, $q.reference_material.Length))
        $correctFb = ($q.correct_feedback -replace "'", "''").Substring(0, [Math]::Min(1000, $q.correct_feedback.Length))
        $incorrectFb = ($q.incorrect_feedback -replace "'", "''").Substring(0, [Math]::Min(1000, $q.incorrect_feedback.Length))
        
        $questionDataJson = ($q.question_data | ConvertTo-Json -Compress -Depth 10) -replace "'", "''"
        
        $sql = @"
INSERT INTO questions (
    question_bank_id, question_type, question_text, difficulty,
    topic, learning_objective, ase_standard, points,
    question_data, explanation, reference_material,
    correct_feedback, incorrect_feedback,
    inserted_at, updated_at
) VALUES (
    $BankId, '$($q.question_type)', '$questionText', '$($q.difficulty)',
    '$topic', '$learningObj', $(if($q.ase_standard){"'$($q.ase_standard)'"}else{"NULL"}), $($q.points),
    '$questionDataJson', '$explanation', '$refMaterial',
    '$correctFb', '$incorrectFb',
    NOW(), NOW()
);
"@
        
        if ($DryRun) {
            $inserted++
            continue
        }
        
        $result = kubectl exec -n autolearnpro $PgPod -- psql -U postgres -d lms_api_prod -c $sql 2>&1
        if ($LASTEXITCODE -eq 0) {
            $inserted++
        } else {
            $failed++
            Write-Log "Failed to insert question: $($q.question_text.Substring(0, [Math]::Min(50, $q.question_text.Length)))" "ERROR"
        }
    }
    
    return @{inserted = $inserted; failed = $failed}
}

# Main Execution
try {
    Write-Log "Starting massive question bank expansion..." "INFO"
    Write-Log "Target: $TotalQuestions questions" "INFO"
    Write-Log "Batch size: $BatchSize" "INFO"
    Write-Log "Log file: $logFile" "INFO"
    
    $progress = Get-Progress
    if ($Resume) {
        Write-Log "Resuming from previous run. Already generated: $($progress.total_generated)" "INFO"
    }
    
    $pgPod = Get-PostgresConnection
    Write-Log "Connected to Postgres pod: $pgPod" "SUCCESS"
    
    # Calculate distribution
    $plan = @()
    foreach ($cat in $distribution.categories.Keys) {
        $catTotal = [int]($TotalQuestions * $distribution.categories[$cat])
        
        foreach ($type in $distribution.question_types.Keys) {
            $typeCount = [int]($catTotal * $distribution.question_types[$type])
            
            foreach ($diff in $distribution.difficulties.Keys) {
                $diffCount = [int]($typeCount * $distribution.difficulties[$diff])
                
                if ($diffCount -gt 0) {
                    $plan += @{
                        category = $cat
                        type = $type
                        difficulty = $diff
                        count = $diffCount
                        batches = [Math]::Ceiling($diffCount / $BatchSize)
                    }
                }
            }
        }
    }
    
    Write-Log "`nGeneration Plan:" "INFO"
    Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "INFO"
    foreach ($item in $plan) {
        Write-Log "  $($item.category) | $($item.type) | $($item.difficulty): $($item.count) questions ($($item.batches) batches)" "INFO"
    }
    Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" "INFO"
    
    $totalBatches = ($plan | Measure-Object -Property batches -Sum).Sum
    $currentBatch = 0
    $startTime = Get-Date
    
    foreach ($item in $plan) {
        $cat = $item.category
        $type = $item.type
        $diff = $item.difficulty
        $targetCount = $item.count
        
        Write-Log "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "INFO"
        Write-Log "Processing: $cat | $type | $diff ($targetCount questions)" "INFO"
        Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "INFO"
        
        $bankId = Get-OrCreate-QuestionBank -Category $cat -Difficulty $diff -PgPod $pgPod
        Write-Log "Question bank ID: $bankId" "INFO"
        
        $generated = 0
        $batchNum = 0
        
        while ($generated < $targetCount) {
            $remaining = $targetCount - $generated
            $batchCount = [Math]::Min($BatchSize, $remaining)
            $batchNum++
            $currentBatch++
            
            $percentComplete = [Math]::Round(($currentBatch / $totalBatches) * 100, 1)
            Write-Log "  Batch $batchNum/$($item.batches) ($percentComplete% overall) - Generating $batchCount questions..." "INFO"
            
            $questions = Generate-QuestionBatch -Category $cat -QuestionType $type -Difficulty $diff -Count $batchCount -AseStandards $ase_standards[$cat]
            
            if ($questions) {
                Write-Log "    Generated: $($questions.Count) questions" "SUCCESS"
                
                $result = Insert-Questions -Questions $questions -BankId $bankId -Category $cat -PgPod $pgPod
                Write-Log "    Inserted: $($result.inserted), Failed: $($result.failed)" $(if($result.failed -gt 0){"WARN"}else{"SUCCESS"})
                
                $generated += $result.inserted
                $progress.total_generated += $result.inserted
                
                # Update progress tracking
                if (-not $progress.by_category[$cat]) { $progress.by_category[$cat] = 0 }
                if (-not $progress.by_type[$type]) { $progress.by_type[$type] = 0 }
                if (-not $progress.by_difficulty[$diff]) { $progress.by_difficulty[$diff] = 0 }
                
                $progress.by_category[$cat] += $result.inserted
                $progress.by_type[$type] += $result.inserted
                $progress.by_difficulty[$diff] += $result.inserted
                
                Save-Progress -Progress $progress
            } else {
                Write-Log "    Failed to generate batch" "ERROR"
                $progress.failed_batches += @{
                    category = $cat
                    type = $type
                    difficulty = $diff
                    batch = $batchNum
                    timestamp = (Get-Date).ToString("o")
                }
            }
            
            # Rate limiting
            Start-Sleep -Milliseconds 500
            
            # Progress update every 10 batches
            if ($currentBatch % 10 -eq 0) {
                $elapsed = (Get-Date) - $startTime
                $rate = $progress.total_generated / $elapsed.TotalMinutes
                $remaining = $TotalQuestions - $progress.total_generated
                $eta = [Math]::Round($remaining / $rate)
                
                Write-Log "`n  Progress Update:" "INFO"
                Write-Log "    Total: $($progress.total_generated)/$TotalQuestions ($percentComplete%)" "INFO"
                Write-Log "    Rate: $([Math]::Round($rate, 1)) questions/minute" "INFO"
                Write-Log "    ETA: $eta minutes" "INFO"
                Write-Log "    Elapsed: $([Math]::Round($elapsed.TotalMinutes, 1)) minutes`n" "INFO"
            }
        }
        
        Write-Log "  ✓ Completed: $generated/$targetCount for $cat | $type | $diff" "SUCCESS"
    }
    
    $totalElapsed = (Get-Date) - $startTime
    
    Write-Log "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "SUCCESS"
    Write-Log "  EXPANSION COMPLETE!" "SUCCESS"
    Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "SUCCESS"
    Write-Log "Total Generated: $($progress.total_generated)/$TotalQuestions" "SUCCESS"
    Write-Log "Success Rate: $([Math]::Round(($progress.total_generated/$TotalQuestions)*100, 2))%" "SUCCESS"
    Write-Log "Time Elapsed: $([Math]::Round($totalElapsed.TotalHours, 2)) hours" "SUCCESS"
    Write-Log "Failed Batches: $($progress.failed_batches.Count)" $(if($progress.failed_batches.Count -gt 0){"WARN"}else{"SUCCESS"})
    
    Write-Log "`nBreakdown by Category:" "INFO"
    foreach ($cat in $progress.by_category.Keys) {
        Write-Log "  $cat: $($progress.by_category[$cat])" "INFO"
    }
    
    Write-Log "`nBreakdown by Type:" "INFO"
    foreach ($type in $progress.by_type.Keys) {
        Write-Log "  $type: $($progress.by_type[$type])" "INFO"
    }
    
    Write-Log "`nBreakdown by Difficulty:" "INFO"
    foreach ($diff in $progress.by_difficulty.Keys) {
        Write-Log "  $diff: $($progress.by_difficulty[$diff])" "INFO"
    }
    
    # Verify final count
    Write-Log "`nVerifying database..." "INFO"
    $finalCount = kubectl exec -n autolearnpro $pgPod -- psql -U postgres -d lms_api_prod -t -c "SELECT COUNT(*) FROM questions WHERE active = true;" 2>$null
    Write-Log "Database total: $($finalCount.Trim()) questions" "SUCCESS"
    
} catch {
    Write-Log "Fatal error: $_" "ERROR"
    Write-Log $_.ScriptStackTrace "ERROR"
    exit 1
}
