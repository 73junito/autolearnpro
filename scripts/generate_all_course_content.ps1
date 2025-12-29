# PowerShell script to generate robust course content for all catalog courses
# This script connects directly to PostgreSQL and Ollama to populate course content

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "  ROBUST COURSE CONTENT GENERATOR" -ForegroundColor Cyan
Write-Host "  Automotive & Diesel LMS" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Configuration
$namespace = "autolearnpro"
$dbPod = (kubectl get pod -n $namespace -l app=postgres -o jsonpath='{.items[0].metadata.name}')
$ollamaUrl = "http://host.docker.internal:11434"
$contentModel = "qwen3-vl:8b"

Write-Host "`nConfiguration:" -ForegroundColor Yellow
Write-Host "  Database Pod: $dbPod"
Write-Host "  Ollama URL: $ollamaUrl"
Write-Host "  AI Model: $contentModel"
Write-Host ""

# Function to execute SQL
function Invoke-SQL {
    param([string]$Query)
    
    $escapedQuery = $Query -replace '"', '\"' -replace "`n", " "
    $result = kubectl exec -n $namespace $dbPod -- psql -U postgres -d lms_api_prod -t -c "$escapedQuery" 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "SQL Error: $result" -ForegroundColor Red
        return $null
    }
    
    return $result
}

# Function to call Ollama AI
function Invoke-OllamaAI {
    param(
        [string]$Prompt,
        [string]$Model = $contentModel
    )
    
    $body = @{
        model = $Model
        prompt = $Prompt
        stream = $false
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$ollamaUrl/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 60
        return $response.response
    } catch {
        Write-Host "AI Error: $_" -ForegroundColor Red
        return $null
    }
}

# Function to generate learning outcomes
function New-LearningOutcomes {
    param([hashtable]$Course)
    
    $courseType = $Course.code.Substring(0, 3)
    
    $baseOutcomes = @(
        "Demonstrate professional shop safety practices and proper tool usage",
        "Apply systematic diagnostic procedures to identify system issues"
    )
    
    $specificOutcomes = switch ($courseType) {
        "AUT" { @(
            "Perform service and repair procedures on automotive systems",
            "Interpret technical service information and wiring diagrams",
            "Use diagnostic scan tools and test equipment effectively"
        )}
        "DSL" { @(
            "Service and maintain diesel engine components and systems",
            "Diagnose diesel-specific issues using proper procedures",
            "Explain diesel combustion principles and emission controls"
        )}
        "EV-" { @(
            "Follow high-voltage safety protocols and lockout/tagout procedures",
            "Diagnose electric vehicle systems using specialized equipment",
            "Explain battery management and charging system operation"
        )}
        "VLB" { @(
            "Navigate virtual diagnostic environments effectively",
            "Complete simulated repair procedures accurately",
            "Interpret virtual test results and diagnostic data"
        )}
        default { @(
            "Apply theoretical knowledge to practical situations",
            "Work effectively in team-based scenarios"
        )}
    }
    
    return $baseOutcomes + $specificOutcomes
}

# Function to create course syllabus
function New-CourseSyllabus {
    param([hashtable]$Course)
    
    Write-Host "    → Creating syllabus..." -ForegroundColor Gray
    
    $outcomes = New-LearningOutcomes -Course $Course
    # Convert to PostgreSQL array format: ARRAY['item1', 'item2']
    $outcomesArray = "ARRAY['" + (($outcomes -join "', '") -replace "'", "''") + "']"
    
    $gradingBreakdown = '{"labs": 35, "quizzes": 20, "midterm": 15, "final_exam": 20, "participation": 10}'
    $assessmentMethods = "ARRAY['Hands-on practical assessments', 'Written quizzes and module exams', 'Lab performance evaluations', 'Virtual simulation exercises', 'Project-based assessments']"
    
    $query = @"
INSERT INTO course_syllabus (course_id, learning_outcomes, assessment_methods, grading_breakdown, 
    prerequisites, required_materials, course_policies, inserted_at, updated_at)
VALUES ($($Course.id), $outcomesArray, $assessmentMethods, '$gradingBreakdown',
    'Basic automotive knowledge recommended', 
    'Safety glasses, course textbook, lab manual, diagnostic tools (provided)',
    'Attendance required for lab sessions. Safety violations result in immediate dismissal from class.',
    NOW(), NOW())
RETURNING id;
"@
    
    $syllabusId = Invoke-SQL -Query $query
    return $syllabusId.Trim()
}

# Function to get module templates for a course
function Get-ModuleTemplates {
    param([string]$CourseCode)
    
    $templates = switch -Wildcard ($CourseCode) {
        "AUT-120*" {
            @(
                @{title="Brake Safety & Hydraulic Fundamentals"; desc="Introduction to brake system safety, tools, and hydraulic principles"; obj=@("Identify brake system components", "Explain Pascal's principle", "Perform brake safety inspection")},
                @{title="Disc Brake Service & Repair"; desc="Complete coverage of disc brake operation, service, and troubleshooting"; obj=@("Service disc brake calipers", "Measure rotor thickness", "Diagnose brake noise issues")},
                @{title="Drum Brake Systems"; desc="Drum brake components, adjustment, and service procedures"; obj=@("Identify drum brake components", "Adjust brake shoes", "Diagnose brake pull conditions")},
                @{title="ABS & Electronic Brake Systems"; desc="Anti-lock braking systems, traction control, and stability systems"; obj=@("Explain ABS operation", "Use scan tool for ABS diagnosis", "Bleed ABS systems properly")}
            )
        }
        "AUT-140*" {
            @(
                @{title="Engine Fundamentals & Theory"; desc="Four-stroke cycle, engine terminology, and basic operation"; obj=@("Explain four-stroke cycle", "Identify engine components", "Measure engine specifications")},
                @{title="Ignition & Fuel Systems"; desc="Ignition timing, fuel delivery, and combustion principles"; obj=@("Test ignition components", "Explain fuel injection operation", "Diagnose no-start conditions")},
                @{title="Engine Performance Diagnostics"; desc="Systematic approach to diagnosing drivability issues"; obj=@("Use scan tool effectively", "Interpret diagnostic codes", "Perform cylinder power balance")},
                @{title="Emission Controls & Testing"; desc="Emission systems, catalytic converters, and emission testing"; obj=@("Identify emission components", "Perform emission tests", "Diagnose catalyst efficiency")}
            )
        }
        "DSL*" {
            @(
                @{title="Diesel Engine Principles"; desc="Compression ignition, diesel combustion, and engine design"; obj=@("Explain diesel combustion", "Identify diesel components", "Describe injection timing")},
                @{title="Diesel Fuel Systems"; desc="Mechanical and electronic fuel injection systems"; obj=@("Service fuel filters", "Test injection pumps", "Diagnose fuel delivery issues")},
                @{title="Air Induction & Turbocharging"; desc="Turbochargers, intercoolers, and air intake systems"; obj=@("Test boost pressure", "Diagnose turbo failures", "Service air intake systems")},
                @{title="Diesel Maintenance & Troubleshooting"; desc="Preventive maintenance and systematic diagnostics"; obj=@("Perform diesel PM service", "Diagnose hard start issues", "Test compression")}
            )
        }
        "EV-*" {
            @(
                @{title="High-Voltage Safety"; desc="EV safety protocols, PPE, and lockout/tagout procedures"; obj=@("Follow HV safety procedures", "Use PPE correctly", "Perform lockout/tagout")},
                @{title="Electric Motor & Power Electronics"; desc="Electric motor operation, inverters, and controllers"; obj=@("Explain motor operation", "Identify power electronics", "Test motor circuits safely")},
                @{title="Battery Systems & Management"; desc="Battery technology, BMS, thermal management"; obj=@("Explain battery chemistry", "Interpret BMS data", "Test battery modules safely")},
                @{title="Charging Systems & Infrastructure"; desc="Level 1/2/3 charging, DC fast charging, grid integration"; obj=@("Explain charging standards", "Diagnose charging issues", "Service charging ports")}
            )
        }
        default {
            @(
                @{title="Fundamentals"; desc="Introduction to core concepts and safety"; obj=@("Understand basic principles", "Apply safety procedures", "Use proper tools")},
                @{title="Systems & Components"; desc="Detailed study of system components and operation"; obj=@("Identify major components", "Explain system operation", "Perform basic tests")},
                @{title="Diagnostics & Service"; desc="Diagnostic procedures and service techniques"; obj=@("Use diagnostic tools", "Follow service procedures", "Interpret test results")},
                @{title="Advanced Applications"; desc="Advanced topics and real-world scenarios"; obj=@("Solve complex problems", "Apply advanced techniques", "Complete practical assessment")}
            )
        }
    }
    
    return $templates
}

# Function to create course modules
function New-CourseModules {
    param([hashtable]$Course)
    
    Write-Host "    → Creating 4 course modules..." -ForegroundColor Gray
    
    $templates = Get-ModuleTemplates -CourseCode $Course.code
    $moduleIds = @()
    
    $seq = 1
    foreach ($template in $templates) {
        # Convert objectives to PostgreSQL array format
        $objectivesArray = "ARRAY['" + (($template.obj -join "', '") -replace "'", "''") + "']"
        $title = $template.title -replace "'", "''"
        $desc = $template.desc -replace "'", "''"
        
        $query = @"
INSERT INTO course_modules (course_id, title, description, sequence_number, duration_weeks, objectives, active, inserted_at, updated_at)
VALUES ($($Course.id), '$title', '$desc', $seq, 2, $objectivesArray, true, NOW(), NOW())
RETURNING id;
"@
        
        $moduleId = Invoke-SQL -Query $query
        $moduleIds += $moduleId.Trim()
        Write-Host "      • Module $seq`: $($template.title)" -ForegroundColor DarkGray
        $seq++
    }
    
    return $moduleIds
}

# Function to generate multimodal lesson content using AI
function New-MultimodalContent {
    param(
        [string]$LessonTitle,
        [string]$LessonType,
        [string]$Difficulty = "intermediate"
    )
    
    # Generate written steps
    $writtenPrompt = @"
You are an expert automotive instructor. Create step-by-step instructions for: $LessonTitle

Format:
## Safety Precautions
- [2-3 key safety items]

## Required Tools
- [List tools needed]

## Procedure
1. [First step with clear action]
2. [Second step]
[Continue with numbered steps]

## Verification
- [How to confirm success]

Keep it concise but complete. Use active voice.
"@
    
    $writtenSteps = Invoke-OllamaAI -Prompt $writtenPrompt
    if (-not $writtenSteps) { 
        $writtenSteps = "# $LessonTitle`n`nComplete the learning activities for this lesson." 
    }
    
    # Generate audio script
    $audioPrompt = @"
Write a 2-minute conversational audio script for an automotive instructor teaching: $LessonTitle

Start with: "Welcome to this lesson on $LessonTitle."
Explain key concepts clearly.
End with: "Practice these skills in the lab."

Use natural, conversational language.
"@
    
    $audioScript = Invoke-OllamaAI -Prompt $audioPrompt
    if (-not $audioScript) {
        $audioScript = "Welcome to this lesson on $LessonTitle. This is an important topic in automotive technology."
    }
    
    # Create practice activity
    $practiceActivity = @{
        type = "scenario"
        title = "Practice: $LessonTitle"
        description = "Apply what you learned in a practical scenario"
        scenario = "A customer reports an issue related to this system. Use your knowledge to diagnose and resolve it."
        questions = @(
            @{
                question = "What is the first step in diagnosing this issue?"
                options = @("Visual inspection", "Use scan tool", "Replace parts", "Ask customer")
                correct = 0
                explanation = "Always start with a thorough visual inspection"
            }
        )
    }
    
    $practiceJson = ($practiceActivity | ConvertTo-Json -Depth 5 -Compress) -replace "'", "''"
    
    return @{
        written = $writtenSteps -replace "'", "''"
        audio = $audioScript -replace "'", "''"
        practice = $practiceJson
    }
}

# Function to create lessons for a module
function New-ModuleLessons {
    param(
        [string]$ModuleId,
        [string]$ModuleTitle,
        [array]$Objectives
    )
    
    $lessonTypes = @(
        @{seq=1; type="lesson"; duration=45},
        @{seq=2; type="lesson"; duration=45},
        @{seq=3; type="lab"; duration=90}
    )
    
    foreach ($lt in $lessonTypes) {
        $lessonTitle = if ($Objectives.Count -ge $lt.seq) {
            if ($lt.type -eq "lab") {
                "Hands-On Lab: $($Objectives[$lt.seq - 1])"
            } else {
                $Objectives[$lt.seq - 1]
            }
        } else {
            "$ModuleTitle - Part $($lt.seq)"
        }
        
        Write-Host "        - Lesson $($lt.seq): $lessonTitle" -ForegroundColor DarkGray
        
        # Generate AI content (with error handling)
        try {
            $content = New-MultimodalContent -LessonTitle $lessonTitle -LessonType $lt.type
        } catch {
            Write-Host "          ⚠ AI generation failed, using basic content" -ForegroundColor Yellow
            $content = @{
                written = "# $lessonTitle`n`nLearning content for this lesson."
                audio = "Welcome to $lessonTitle"
                practice = "{}"
            }
        }
        
        $query = @"
INSERT INTO module_lessons (module_id, title, sequence_number, lesson_type, duration_minutes, 
    content, written_steps, audio_script, practice_activities, active, inserted_at, updated_at)
VALUES ($ModuleId, '$($lessonTitle -replace "'", "''")', $($lt.seq), '$($lt.type)', $($lt.duration),
    '$($content.written)', '$($content.written)', '$($content.audio)', '$($content.practice)', 
    true, NOW(), NOW());
"@
        
        $result = Invoke-SQL -Query $query
    }
}

# Main execution
Write-Host "`nFetching all courses from database..." -ForegroundColor Yellow
$coursesQuery = "SELECT id, code, title, level FROM courses ORDER BY code;"
$coursesResult = Invoke-SQL -Query $coursesQuery

if (-not $coursesResult) {
    Write-Host "Failed to fetch courses from database!" -ForegroundColor Red
    exit 1
}

# Parse courses
$courses = @()
$coursesResult -split "`n" | Where-Object { $_.Trim() -and $_ -notmatch "^\s*id\s*\|" -and $_ -notmatch "^---" } | ForEach-Object {
    $parts = $_ -split '\|' | ForEach-Object { $_.Trim() }
    if ($parts.Count -ge 4 -and $parts[0] -match '^\d+$') {
        $courses += @{
            id = $parts[0]
            code = $parts[1]
            title = $parts[2]
            level = $parts[3]
        }
    }
}

Write-Host "Found $($courses.Count) courses`n" -ForegroundColor Green

# Generate content for each course
$successCount = 0
$totalCourses = $courses.Count

foreach ($course in $courses) {
    $index = $courses.IndexOf($course) + 1
    Write-Host "[$index/$totalCourses] Processing: $($course.code) - $($course.title)" -ForegroundColor Cyan
    
    try {
        # Create syllabus
        $syllabusId = New-CourseSyllabus -Course $course
        
        # Create modules
        $moduleIds = New-CourseModules -Course $course
        
        # Create lessons for each module
        $templates = Get-ModuleTemplates -CourseCode $course.code
        for ($i = 0; $i -lt $moduleIds.Count; $i++) {
            $moduleId = $moduleIds[$i]
            $template = $templates[$i]
            Write-Host "      • Module $($i + 1): $($template.title)" -ForegroundColor Gray
            New-ModuleLessons -ModuleId $moduleId -ModuleTitle $template.title -Objectives $template.obj
        }
        
        Write-Host "    ✓ Complete!" -ForegroundColor Green
        $successCount++
        
    } catch {
        Write-Host "    ✗ Failed: $_" -ForegroundColor Red
    }
    
    Write-Host ""
}

# Summary
Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "  CONTENT GENERATION COMPLETE" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Successful: $successCount/$totalCourses courses" -ForegroundColor Green
Write-Host "  Failed: $($totalCourses - $successCount)" -ForegroundColor $(if ($totalCourses -eq $successCount) { "Green" } else { "Yellow" })
Write-Host ""
Write-Host "Generated content:" -ForegroundColor Yellow
Write-Host "  • $($successCount * 1) syllabi"
Write-Host "  • $($successCount * 4) modules"
Write-Host "  • $($successCount * 4 * 3) lessons with multimodal content"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review content in database"
Write-Host "  2. Generate visual diagrams using Flux_AI"
Write-Host "  3. Create audio narration files"
Write-Host "  4. Deploy updated frontend"
Write-Host ""
