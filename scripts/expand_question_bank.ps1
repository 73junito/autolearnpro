<parameter name="content"># ============================================================================
# Question Bank Expansion Script
# Generates 10,000 ASE-certified questions across automotive categories
# ============================================================================

param(
    [int]$TotalQuestions = 10000,
    [switch]$CheckDuplicates = $true,
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Question Bank Expansion - Generate $TotalQuestions Questions" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# Question distribution by category (percentages)
$distribution = @{
    "ev" = 0.25              # 2,500 questions (25% - highest gap)
    "diesel" = 0.20          # 2,000 questions (20%)
    "engine_performance" = 0.20  # 2,000 questions (20%)
    "brakes" = 0.15          # 1,500 questions (15%)
    "electrical" = 0.20      # 2,000 questions (20%)
}

# Difficulty distribution within each category
$difficulty_dist = @{
    "easy" = 0.30
    "medium" = 0.50
    "hard" = 0.20
}

# ASE Standards by category
$ase_standards = @{
    "ev" = @("L3.A.1", "L3.A.2", "L3.A.3", "L3.B.1", "L3.B.2", "L3.C.1")
    "diesel" = @("T2.A.1", "T2.A.2", "T2.B.1", "T2.C.1", "T2.D.1")
    "engine_performance" = @("A8.A.1", "A8.A.2", "A8.B.1", "A8.C.1", "A8.D.1")
    "brakes" = @("A5.A.1", "A5.A.2", "A5.B.1", "A5.C.1", "A5.D.1")
    "electrical" = @("A6.A.1", "A6.A.2", "A6.B.1", "A6.C.1", "A6.D.1")
}

function Get-PodName {
    $podName = kubectl get pod -n autolearnpro -l app=lms-api -o jsonpath='{.items[0].metadata.name}' 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to get LMS API pod name"
    }
    return $podName.Trim()
}

function Invoke-ElixirCommand {
    param(
        [string]$Command,
        [string]$PodName
    )
    
    $fullCommand = "kubectl exec -n autolearnpro $PodName -- /app/bin/lms_api eval `"$Command`""
    Write-Host "  > Executing: $Command" -ForegroundColor DarkGray
    
    if ($DryRun) {
        Write-Host "  [DRY RUN] Would execute: $fullCommand" -ForegroundColor Yellow
        return $true
    }
    
    $output = Invoke-Expression $fullCommand 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Error: $output" -ForegroundColor Red
        return $false
    }
    
    Write-Host "  $output" -ForegroundColor Green
    return $true
}

function Generate-CategoryQuestions {
    param(
        [string]$Category,
        [int]$TotalCount,
        [array]$AseStandards,
        [string]$PodName
    )
    
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  Category: $($Category.ToUpper()) - $TotalCount questions" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    $difficulties = @("easy", "medium", "hard")
    $categorySuccess = 0
    
    foreach ($diff in $difficulties) {
        $diffCount = [int]($TotalCount * $difficulty_dist[$diff])
        if ($diffCount -eq 0) { continue }
        
        Write-Host "`n  Difficulty: $diff ($diffCount questions)" -ForegroundColor Yellow
        
        # Convert ASE standards to Elixir list format
        $aseList = '["' + ($AseStandards -join '", "') + '"]'
        
        # Generate questions
        $command = "alias LmsApi.QuestionBankManager; " +
                   "{:ok, questions} = QuestionBankManager.generate_bulk_questions(" +
                   "`"$Category`", `"$diff`", $diffCount, " +
                   "ase_standards: $aseList); " +
                   "IO.puts(`"Generated: #{length(questions)}`"); " +
                   "questions"
        
        $result = Invoke-ElixirCommand -Command $command -PodName $PodName
        
        if ($result) {
            # Check for duplicates if enabled
            if ($CheckDuplicates) {
                Write-Host "  Checking for duplicates..." -ForegroundColor Yellow
                
                $dupCommand = "alias LmsApi.QuestionBankManager; " +
                             "{unique, dupes} = QuestionBankManager.check_for_duplicates(questions); " +
                             "IO.puts(`"Unique: #{length(unique)}, Duplicates: #{length(dupes)}`"); " +
                             "unique"
                
                $dupResult = Invoke-ElixirCommand -Command $dupCommand -PodName $PodName
                
                if (-not $dupResult) {
                    Write-Host "  Warning: Duplicate check failed, proceeding with all questions" -ForegroundColor Yellow
                }
            }
            
            # Insert questions
            Write-Host "  Inserting into database..." -ForegroundColor Yellow
            
            $insertCommand = "alias LmsApi.QuestionBankManager; " +
                           "{:ok, count} = QuestionBankManager.insert_questions(" +
                           "questions, `"$Category`", `"$diff`"); " +
                           "IO.puts(`"Inserted: #{count}`")"
            
            $insertResult = Invoke-ElixirCommand -Command $insertCommand -PodName $PodName
            
            if ($insertResult) {
                $categorySuccess += $diffCount
                Write-Host "  ✓ Successfully processed $diff questions" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Failed to insert $diff questions" -ForegroundColor Red
            }
        } else {
            Write-Host "  ✗ Failed to generate $diff questions" -ForegroundColor Red
        }
        
        # Delay between batches to avoid API rate limits
        Start-Sleep -Seconds 2
    }
    
    Write-Host "`n  Category Summary: $categorySuccess/$TotalCount questions processed" -ForegroundColor $(if ($categorySuccess -eq $TotalCount) { "Green" } else { "Yellow" })
    return $categorySuccess
}

# Main execution
try {
    Write-Host "Step 1: Connecting to Kubernetes cluster..." -ForegroundColor Cyan
    $podName = Get-PodName
    Write-Host "  ✓ Connected to pod: $podName" -ForegroundColor Green
    
    Write-Host "`nStep 2: Verifying database connection..." -ForegroundColor Cyan
    $dbCheck = Invoke-ElixirCommand -Command "LmsApi.Repo.query!(`"SELECT COUNT(*) FROM questions`", [])" -PodName $podName
    if ($dbCheck) {
        Write-Host "  ✓ Database connection verified" -ForegroundColor Green
    } else {
        throw "Database connection failed"
    }
    
    Write-Host "`nStep 3: Getting current question statistics..." -ForegroundColor Cyan
    $statsCommand = "alias LmsApi.QuestionBankManager; " +
                    "stats = QuestionBankManager.get_question_stats(); " +
                    "total = Enum.reduce(stats, 0, fn s, acc -> acc + s.count end); " +
                    "IO.puts(`"Current total: #{total} questions`")"
    Invoke-ElixirCommand -Command $statsCommand -PodName $podName
    
    if ($DryRun) {
        Write-Host "`n[DRY RUN MODE] Would generate the following:" -ForegroundColor Yellow
    }
    
    Write-Host "`nStep 4: Generating questions by category..." -ForegroundColor Cyan
    
    $totalGenerated = 0
    foreach ($category in $distribution.Keys) {
        $count = [int]($TotalQuestions * $distribution[$category])
        $ase = $ase_standards[$category]
        
        $generated = Generate-CategoryQuestions -Category $category -TotalCount $count -AseStandards $ase -PodName $podName
        $totalGenerated += $generated
    }
    
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  EXPANSION COMPLETE" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  Total Generated: $totalGenerated / $TotalQuestions" -ForegroundColor Green
    Write-Host "  Success Rate: $([math]::Round($totalGenerated/$TotalQuestions*100, 1))%" -ForegroundColor Green
    
    Write-Host "`nStep 5: Final statistics..." -ForegroundColor Cyan
    Invoke-ElixirCommand -Command $statsCommand -PodName $podName
    
    Write-Host "`n✓ Question bank expansion completed successfully!" -ForegroundColor Green
    
} catch {
    Write-Host "`n✗ Error: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
}
