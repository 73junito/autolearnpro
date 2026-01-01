# Minimal ASE standards mapping for each category
$ase_standards = @{
    engine_performance = @("A8.A.1", "A8.A.2")
    fuel_systems = @("A8.B.1", "A8.B.2")
    ev = @("A6.EV.1", "A6.EV.2")
    electrical = @("A6.A.1", "A6.A.2")
}
# Minimal Get-Progress function for progress tracking
function Get-Progress {
    if (Test-Path $progressFile) {
        try {
            $progress = Get-Content $progressFile | ConvertFrom-Json
            if (-not $progress.by_type) { $progress.by_type = @{} }
            if (-not $progress.by_difficulty) { $progress.by_difficulty = @{} }
            if (-not $progress.failed_batches) { $progress.failed_batches = @() }
            if (-not $progress.start_time) { $progress.start_time = (Get-Date).ToString("o") }
            if (-not $progress.by_category) { $progress.by_category = @{} }
            if (-not $progress.total_generated) { $progress.total_generated = 0 }
            return $progress
        } catch {
            Write-Log "Progress file is corrupt or unreadable, reinitializing." "WARN"
        }
    }
    $progress = [PSCustomObject]@{
        by_type = @{}
        by_difficulty = @{}
        by_category = @{}
        failed_batches = @()
        start_time = (Get-Date).ToString("o")
        total_generated = 0
    }
    return $progress
}
# Minimal Test-OllamaConnection function to check for Ollama CLI
function Test-OllamaConnection {
    try {
        $null = ollama --help 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}
# Simple Write-Log function for colored output
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $color = switch ($Level.ToUpper()) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "SUCCESS" { "Green" }
        "DEBUG" { "Gray" }
        default { "Cyan" }
    }
    Write-Host $Message -ForegroundColor $color
}
# ============================================================================
# 200K Question Bank Generation using Ollama (Local LLM)
# FREE - No API costs, unlimited generation
# Uses Ollama CLI for reliability
# ============================================================================


param(
    [int]$TotalQuestions,
    [string]$Model,
    [int]$BatchSize,
    [int]$QuestionsPerRun,
    [switch]$Resume,
    [switch]$DryRun,
    [switch]$TestMode
)

# Set default values if not provided
if (-not $TotalQuestions) { $TotalQuestions = 200000 }
if (-not $Model) { $Model = "mistral:7b" }
if (-not $BatchSize) { $BatchSize = 10 }
if (-not $QuestionsPerRun) { $QuestionsPerRun = 500 }

$ErrorActionPreference = "Continue"  # Don't stop on errors, handle them gracefully

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  OLLAMA-POWERED QUESTION GENERATION - $TotalQuestions Questions" -ForegroundColor Cyan
Write-Host "  Model: $Model | FREE - No API costs!" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

if ($TestMode) {
    $TotalQuestions = 30
    $QuestionsPerRun = 30
    $BatchSize = 3
    Write-Host "TEST MODE: Generating 30 questions in batches of 3" -ForegroundColor Yellow
}

# Configuration
$distribution = @{
    categories = @{
        ev = 0.25
        engine_performance = 0.25
        fuel_systems = 0.25
        electrical = 0.25
    }
    question_types = @{
        true_false = 1.0
    }
    difficulties = @{
        easy = 0.5
        medium = 0.3
        hard = 0.2
    }
}
function Get-AvailableModels {
    try {
        $output = ollama list 2>&1
        if ($LASTEXITCODE -eq 0) {
            # Parse ollama list output (skip header line)
            $models = $output | Select-Object -Skip 1 | ForEach-Object {
                if ($_ -match '^(\S+)') {
                    $Matches[1]
                }
            }
            return $models
        }
        return @()
    }
    catch {
        return @()
    }
}

function Invoke-Ollama {
    param(
        [string]$Prompt,
        [string]$Model = "lms-assistant"
    )
    
    # Use file-based approach for stability with strict output limits
    try {
        Write-Log "  Calling Ollama CLI (model: $Model)..." "DEBUG"
        
        # Save prompt to temp file
        $tempFile = [System.IO.Path]::Combine($env:TEMP, "ollama_prompt_$(Get-Random).txt")
        $Prompt | Out-File -FilePath $tempFile -Encoding UTF8 -NoNewline
        
        # Call ollama with file input - model has built-in token limits
        $response = cmd /c "type `"$tempFile`" | ollama run $Model --nowordwrap 2>&1"
        
        # Clean up
        Remove-Item $tempFile -ErrorAction SilentlyContinue
        
        if ($LASTEXITCODE -eq 0 -and $response) {
            # Join array response into single string
            $responseText = if ($response -is [array]) { $response -join "`n" } else { $response }
            
            # Guard against overly long responses (should be prevented by model config)
            if ($responseText.Length -gt 5000) {
                Write-Log "  ⚠ Response too long ($($responseText.Length) chars), truncating..." "WARN"
                $responseText = $responseText.Substring(0, 5000)
            }
            
            Write-Log "  Ollama response received: $($responseText.Length) chars" "DEBUG"
            return $responseText
        } else {
            Write-Log "  Ollama CLI error (exit code: $LASTEXITCODE)" "ERROR"
            if ($response) {
                Write-Log "  Output: $($response | Select-Object -First 3)" "DEBUG"
            }
            return $null
        }
    }
    catch {
        Write-Log "Ollama CLI Error: $($_.Exception.Message)" "ERROR"
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

    $systemPrompt = @"
You are a JSON-only generator.
Rules:
- Output ONLY valid JSON
- Output ONLY a JSON array
- No extra text
- No markdown
- End output with ]
"@


    $schema = switch ($QuestionType) {
        "true_false" {
            '[{"question_type":"true_false","question_text":"string","question_data":{"correct":true},"difficulty":"easy","points":1,"ase_standard":"A8.A.1"}]'
        }
        "multiple_choice" {
            '[{"question_type":"multiple_choice","question_text":"string","options":["A","B","C","D"],"correct":0}]'
        }
        "fill_blank" {
            '[{"question_type":"fill_blank","question_text":"string","blanks":["answer"],"case_sensitive":false}]'
        }
    }

    $aseText = if ($AseStandards) { ($AseStandards -join ", ") } else { "N/A" }
    $userPrompt = @"
Generate EXACTLY $Count $QuestionType questions.
Topic: $Category
Difficulty: $Difficulty

ASE STANDARDS: $aseText
Choose ONE appropriate ASE standard per question and set 'ase_standard' field.

Each object MUST include:
- question_type
- question_text
- question_data.correct (boolean)
- difficulty
- points
- ase_standard (choose one from list above)

Schema:
$schema
"@

    $prompt = $systemPrompt + "`n" + $userPrompt

    Write-Log "  Generating batch with Ollama ($Model)..." "INFO"
    $response = Invoke-Ollama -Prompt $prompt -Model $Model



    if (-not $response) {
        return $null
    }

    # Detect and handle truncation
    $wasTruncated = $false
    if ($response.Length -gt 5000) {
        Write-Log "Response too long ($($response.Length) chars), truncating and retrying with smaller batch..." "WARN"
        $wasTruncated = $true
    }
    if ($response.Length -lt 100) {
        Write-Log "Response too short, likely truncated. Skipping." "WARN"
        $failFile = "scripts/ollama_failed_response_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
        $response | Out-File -FilePath $failFile -Encoding utf8
        Write-Log "Saved failed response to $failFile" "WARN"
        return $null
    }
    if ($wasTruncated -and $Count -gt 1) {
        Write-Log "Retrying batch with smaller size ($([Math]::Floor($Count/2)))..." "WARN"
        return Generate-QuestionBatch -Category $Category -QuestionType $QuestionType -Difficulty $Difficulty -Count ([Math]::Floor($Count/2)) -AseStandards $AseStandards
    }

    # Attempt to auto-close incomplete JSON arrays
    $responseClean = $response.Trim()
    if ($responseClean.StartsWith('[') -and -not $responseClean.TrimEnd().EndsWith(']')) {
        $responseClean += ']'
    }

    $parsed = $null
    $parseSuccess = $false
    try {
        $parsed = $responseClean | ConvertFrom-Json
        if ($parsed -is [array]) {
            $parseSuccess = $true
            return $parsed
        } elseif ($parsed) {
            $parseSuccess = $true
            return @($parsed)
        }
    } catch {
        Write-Log "JSON parse failed" "ERROR"
        Write-Log ($responseClean.Substring(0, [Math]::Min(500, $responseClean.Length))) "ERROR"
    }

    # Auto-rephrase: retry with stricter prompt if JSON failed
    if (-not $parseSuccess) {
        Write-Log "Retrying with stricter prompt..." "WARN"
        $stricterPrompt = $systemPrompt + "\nSTRICT: Output ONLY a valid JSON array, no explanation, no markdown, no extra text, no trailing commas, end with ]\n" + $userPrompt
        $response2 = Invoke-Ollama -Prompt $stricterPrompt -Model $Model
        if ($response2) {
            $responseClean2 = $response2.Trim()
            if ($responseClean2.StartsWith('[') -and -not $responseClean2.TrimEnd().EndsWith(']')) {
                $responseClean2 += ']'
            }
            try {
                $parsed2 = $responseClean2 | ConvertFrom-Json
                if ($parsed2 -is [array]) { return $parsed2 }
                elseif ($parsed2) { return @($parsed2) }
            } catch {
                Write-Log "JSON parse failed (retry)" "ERROR"
                Write-Log ($responseClean2.Substring(0, [Math]::Min(500, $responseClean2.Length))) "ERROR"
            }
        }
    }

    return $null
}

function Save-Progress {
    param($Progress)
    $Progress | ConvertTo-Json -Depth 10 | Set-Content $progressFile
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
    
    $checkSql = "SELECT id FROM question_banks WHERE name = '$name' LIMIT 1;"
    $result = kubectl exec -n autolearnpro $PgPod -- psql -U postgres -d lms_api_prod -t -c $checkSql 2>$null
    
    if ($result) {
        # Extract first non-empty line as ID
        $id = ($result | Where-Object { $_.Trim() -ne "" } | Select-Object -First 1).Trim()
        if ($id -and $id -match '^\d+$') {
            return [int]$id
        }
    }
    
    $insertSql = @"
INSERT INTO question_banks (name, description, category, difficulty, inserted_at, updated_at)
VALUES ('$name', 'Questions for $category at $difficulty level', '$category', '$difficulty', NOW(), NOW())
RETURNING id;
"@
    
    $result = kubectl exec -n autolearnpro $PgPod -- psql -U postgres -d lms_api_prod -t -c $insertSql 2>$null
    # Extract first non-empty line as ID
    $id = ($result | Where-Object { $_.Trim() -ne "" } | Select-Object -First 1).Trim()
    if ($id -and $id -match '^\d+$') {
        return [int]$id
    }
    
    Write-Log "Failed to get question bank ID from result: $result" "ERROR"
    throw "Could not create or retrieve question bank"
}

function Insert-Questions {
    param(
        [array]$Questions,
        [int]$BankId,
        [string]$PgPod
    )
    
    $inserted = 0
    $failed = 0
    
    foreach ($q in $Questions) {
        # Validate required fields
        if (-not $q.question_text -or -not $q.question_data) {
            $failed++
            continue
        }
        
        # Escape and truncate fields
        $questionText = ($q.question_text -replace "'", "''").Substring(0, [Math]::Min(5000, $q.question_text.Length))
        $topic = if ($q.topic) { ($q.topic -replace "'", "''").Substring(0, [Math]::Min(200, $q.topic.Length)) } else { "General" }
        $learningObj = if ($q.learning_objective) { ($q.learning_objective -replace "'", "''").Substring(0, [Math]::Min(500, $q.learning_objective.Length)) } else { "" }
        $explanation = if ($q.explanation) { ($q.explanation -replace "'", "''").Substring(0, [Math]::Min(5000, $q.explanation.Length)) } else { "" }
        $refMaterial = if ($q.reference_material) { ($q.reference_material -replace "'", "''").Substring(0, [Math]::Min(500, $q.reference_material.Length)) } else { "" }
        $correctFb = if ($q.correct_feedback) { ($q.correct_feedback -replace "'", "''").Substring(0, [Math]::Min(1000, $q.correct_feedback.Length)) } else { "Correct!" }
        $incorrectFb = if ($q.incorrect_feedback) { ($q.incorrect_feedback -replace "'", "''").Substring(0, [Math]::Min(1000, $q.incorrect_feedback.Length)) } else { "Try again" }
        
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
        }
    }
    
    return @{inserted = $inserted; failed = $failed}
}

# Main Execution
try {
    Write-Log "Starting Ollama-powered question generation..." "INFO"
    Write-Log "Model: $Model" "INFO"
    
    # Test Ollama CLI
    Write-Log "Testing Ollama CLI..." "INFO"
    if (-not (Test-OllamaConnection)) {
        Write-Log "✗ Cannot connect to Ollama CLI" "ERROR"
        Write-Log "Please ensure Ollama is running: ollama serve" "ERROR"
        exit 1
    }
    Write-Log "✓ Ollama CLI available" "SUCCESS"
    
    # Check available models
    $models = Get-AvailableModels
    Write-Log "Available models: $($models -join ', ')" "INFO"
    
    # Check if model exists (handle :latest suffix)
    $modelBase = $Model -replace ':latest$', ''
    $modelExists = $models | Where-Object { $_ -eq $Model -or $_ -match "^$modelBase" }
    
    if (-not $modelExists) {
        Write-Log "Model '$Model' not found." "ERROR"
        Write-Log "Available models: $($models -join ', ')" "ERROR"
        Write-Log "Please create the LMS model:" "ERROR"
        Write-Log "  cd scripts" "ERROR"
        Write-Log "  ollama create lms-assistant -f Modelfile.lms-assistant" "ERROR"
        exit 1
    }
    
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
    
    Write-Log "`nGeneration Plan (Ollama - FREE):" "INFO"
    Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "INFO"
    foreach ($item in $plan) {
        Write-Log "  $($item.category) | $($item.type) | $($item.difficulty): $($item.count) questions ($($item.batches) batches)" "INFO"
    }
    Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" "INFO"
    
    $totalBatches = ($plan | Measure-Object -Property batches -Sum).Sum
    $currentBatch = 0
    $startTime = Get-Date
    $questionsGeneratedThisRun = 0
    
    foreach ($item in $plan) {
        # Check if we've reached the per-run limit
        if ($questionsGeneratedThisRun -ge $QuestionsPerRun) {
            Write-Log "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "SUCCESS"
            Write-Log "✓ Reached $QuestionsPerRun questions limit for this run" "SUCCESS"
            Write-Log "Total generated this session: $questionsGeneratedThisRun" "SUCCESS"
            Write-Log "Overall progress: $($progress.total_generated) / $TotalQuestions" "INFO"
            Write-Log "Run script again to continue (it will auto-resume)" "INFO"
            Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "SUCCESS"
            break
        }
        
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
        $consecutiveFailures = 0
        $maxConsecutiveFailures = 3

        while ($generated -lt $targetCount -and $progress.total_generated -lt $TotalQuestions) {
            if ($consecutiveFailures -ge $maxConsecutiveFailures) {
                Write-Log "  ⚠ Skipping after $maxConsecutiveFailures consecutive failures" "ERROR"
                break
            }

            $remaining = $targetCount - $generated
            $remainingGlobal = $TotalQuestions - $progress.total_generated
            if ($remainingGlobal -le 0) { break }
            $adaptiveBatch = [Math]::Min([Math]::Min($BatchSize, $remaining), $remainingGlobal)
            $success = $false
            $attemptedBatch = $adaptiveBatch
            while ($adaptiveBatch -ge 1 -and -not $success) {
                $batchNum++
                $currentBatch++
                $percentComplete = [Math]::Round(($currentBatch / $totalBatches) * 100, 1)
                Write-Log "  Batch $batchNum/$($item.batches) ($percentComplete% overall) - $adaptiveBatch questions..." "INFO"

                $questions = Generate-QuestionBatch -Category $cat -QuestionType $type -Difficulty $diff -Count $adaptiveBatch -AseStandards $ase_standards[$cat]

                if ($questions -and $questions.Count -gt 0) {
                    $consecutiveFailures = 0  # Reset on success
                    $result = Insert-Questions -Questions $questions -BankId $bankId -PgPod $pgPod
                    Write-Log "    Inserted: $($result.inserted), Failed: $($result.failed)" $(if($result.failed -gt 0){"WARN"}else{"SUCCESS"})

                    $generated += $result.inserted
                    $progress.total_generated += $result.inserted
                    $questionsGeneratedThisRun += $result.inserted

                    if (-not $progress.by_category[$cat]) { $progress.by_category[$cat] = 0 }
                    if (-not $progress.by_type[$type]) { $progress.by_type[$type] = 0 }
                    if (-not $progress.by_difficulty[$diff]) { $progress.by_difficulty[$diff] = 0 }

                    $progress.by_category[$cat] += $result.inserted
                    $progress.by_type[$type] += $result.inserted
                    $progress.by_difficulty[$diff] += $result.inserted

                    Save-Progress -Progress $progress

                    # Check if we've hit the per-run limit
                    if ($questionsGeneratedThisRun -ge $QuestionsPerRun) {
                        Write-Log "  ℹ Reached $QuestionsPerRun questions for this run, will exit after this category" "INFO"
                    }
                    $success = $true
                } else {
                    # Try a smaller batch size
                    $adaptiveBatch = [Math]::Floor($adaptiveBatch / 2)
                    if ($adaptiveBatch -lt 1) { $adaptiveBatch = 1 }
                    if ($adaptiveBatch -eq $attemptedBatch) { $adaptiveBatch-- } # avoid infinite loop
                }
            }

            if (-not $success) {
                $consecutiveFailures++
                Write-Log "    Failed to generate batch (failure $consecutiveFailures/$maxConsecutiveFailures)" "ERROR"
                $progress.failed_batches += @{
                    category = $cat
                    type = $type
                    difficulty = $diff
                    batch = $batchNum
                    timestamp = (Get-Date).ToString("o")
                }

                # Don't count failed batch in progress
                $currentBatch--
                $batchNum--
            }

            # Small delay
            Start-Sleep -Milliseconds 100

            # Progress update with moving average smoothing
            if (-not $global:rateHistory) { $global:rateHistory = @() }
            if (-not $global:etaHistory) { $global:etaHistory = @() }
            if ($currentBatch % 5 -eq 0) {
                $elapsed = (Get-Date) - $startTime
                $rate = if ($elapsed.TotalMinutes -gt 0) { $progress.total_generated / $elapsed.TotalMinutes } else { 0 }
                $remaining = $TotalQuestions - $progress.total_generated
                $eta = if ($rate -gt 0) { [Math]::Round($remaining / $rate) } else { 0 }

                # Keep last 10 values for smoothing
                $global:rateHistory += $rate
                $global:etaHistory += $eta
                if ($global:rateHistory.Count -gt 10) { $global:rateHistory = $global:rateHistory[-10..-1] }
                if ($global:etaHistory.Count -gt 10) { $global:etaHistory = $global:etaHistory[-10..-1] }

                $smoothedRate = [Math]::Round(($global:rateHistory | Measure-Object -Average).Average, 1)
                $smoothedEta = [Math]::Round(($global:etaHistory | Measure-Object -Average).Average)

                Write-Log "`n  Progress Update:" "INFO"
                Write-Log "    Total: $($progress.total_generated)/$TotalQuestions ($percentComplete%)" "INFO"
                Write-Log "    Rate: $smoothedRate questions/minute" "INFO"
                Write-Log "    ETA: $smoothedEta minutes" "INFO"
                Write-Log "    Elapsed: $([Math]::Round($elapsed.TotalMinutes, 1)) minutes`n" "INFO"
            }
        }
        
        Write-Log "  ✓ Completed: $generated/$targetCount" "SUCCESS"
    }
    
    $totalElapsed = (Get-Date) - $startTime
    
    if ($progress.total_generated -ge $TotalQuestions) {
        Write-Log "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "SUCCESS"
        Write-Log "  🎉 GENERATION COMPLETE! (Ollama - $Model)" "SUCCESS"
        Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "SUCCESS"
        Write-Log "Total Generated: $($progress.total_generated)/$TotalQuestions" "SUCCESS"
        Write-Log "Time Elapsed: $([Math]::Round($totalElapsed.TotalHours, 2)) hours" "SUCCESS"
        Write-Log "Cost: FREE (Local Ollama)" "SUCCESS"
    } else {
        Write-Log "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "INFO"
        Write-Log "  Session Complete - Run Again to Continue" "INFO"
        Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "INFO"
        Write-Log "Generated this run: $questionsGeneratedThisRun" "SUCCESS"
        Write-Log "Total progress: $($progress.total_generated)/$TotalQuestions ($([Math]::Round(($progress.total_generated/$TotalQuestions)*100, 1))%)" "INFO"
        Write-Log "Time elapsed: $([Math]::Round($totalElapsed.TotalMinutes, 1)) minutes" "INFO"
        Write-Log "`nTo continue: .\scripts\generate_200k_ollama.ps1 -Resume" "INFO"
        Write-Log "Or just run: .\scripts\generate_200k_ollama.ps1 (auto-resumes)" "INFO"
    }
    
    # Verify
    $finalCount = kubectl exec -n autolearnpro $pgPod -- psql -U postgres -d lms_api_prod -t -c "SELECT COUNT(*) FROM questions WHERE active = true;" 2>$null
    Write-Log "`nDatabase total: $($finalCount.Trim()) questions" "INFO"
    
} catch {
    Write-Log "Fatal error: $_" "ERROR"
    Write-Log $_.ScriptStackTrace "ERROR"
    exit 1
}
