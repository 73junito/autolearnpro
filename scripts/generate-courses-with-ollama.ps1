<#
Generate course HTML pages using local Ollama model `qwen3-vl:8b`.
Creates `docs/site/generated/` and writes HTML files.
Requires: `ollama` CLI available and model `qwen3-vl:8b` installed locally.
#>

Param()

function Run-OllamaText {
  param(
    [string]$Prompt
  )
  # Call Ollama with the prompt as a single positional argument, capture output,
  # and return the last substantial paragraph (strip model analysis/footer).
  $raw = & ollama run qwen3-vl:8b "${Prompt}" 2>$null
  $text = $raw -join "`n"
  # Split into paragraph blocks and pick the last one that looks like prose
  $blocks = $text -split "(`r`n){2,}|(`n){2,}"
  $candidate = $blocks | Where-Object { $_.Trim().Length -gt 50 } | Select-Object -Last 1
  if (-not $candidate) { return $null }
  $desc = $candidate.Trim()
  # Remove trailing parenthetical like '(137 words)'
  $desc = $desc -replace '\s*\(\d+\s*words\)\s*$',''
  return $desc
}

$outDir = Join-Path (Get-Location) 'docs/site/generated'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$courses = @(
  @{ key='course-intro-to-diesel-engines'; title='Introduction to Diesel Engines'; thumbnail='../images/course-1.png'; level='Beginner'; lessons=6; modules=@('Engine Fundamentals','Fuel Systems','Ignition & Compression','Cooling & Lubrication','Diagnostics & Tools','Maintenance Best Practices') },
  @{ key='advanced-engine-diagnostics'; title='Advanced Engine Diagnostics'; thumbnail='../images/course-2.png'; level='Intermediate'; lessons=8; modules=@('Sensor Basics','Fault Code Interpretation','Oscilloscope Techniques','CAN Bus Basics','Practical Diagnostic Labs') },
  @{ key='fuel-systems-injection'; title='Fuel Systems & Injection'; thumbnail='../images/course-3.png'; level='Advanced'; lessons=10; modules=@('Fuel Pump Types','Injection Principles','Pressure & Flow Testing','Calibration Methods','Troubleshooting Common Failures') }
)

foreach ($c in $courses) {
  Write-Host "Generating description for: $($c.title)" -ForegroundColor Cyan
  $prompt = "Write a concise course overview of approximately 120-150 words for the course titled '$($c.title)'. Focus on practical skills, hands-on labs, and outcomes for learners in automotive diesel contexts. Do not include HTML, output only the paragraph."
  $desc = Run-OllamaText -Prompt $prompt
  if (-not $desc -or $desc -match 'ERROR' -or $desc.Length -lt 50) {
    Write-Host "Model did not return a good description for $($c.title); using fallback text." -ForegroundColor Yellow
    $desc = "$($c.title) provides practical instruction on diesel engine systems, maintenance, and diagnostics. Through hands-on labs and guided exercises, learners develop core knowledge and practical skills to inspect, test, and maintain diesel engines safely and effectively."
  }

  # Learning outcomes defaults
  $learning_outcomes = @(
    'Understand core diesel engine principles and components.',
    'Perform basic diagnostics and routine maintenance tasks.',
    'Apply workshop safety and best-practice procedures.'
  )

  # Build HTML
  $htmlBuilder = @()
  $htmlBuilder += '<!doctype html>'
  $htmlBuilder += "<html lang='en'>"
  $htmlBuilder += '<head>'
  $htmlBuilder += "  <meta charset='utf-8' />"
  $htmlBuilder += "  <meta name='viewport' content='width=device-width,initial-scale=1' />"
  $htmlBuilder += "  <title>$($c.title) — AutoLearnPro</title>"
  $htmlBuilder += "  <link rel='stylesheet' href='../styles.css'>"
  $htmlBuilder += "  <meta name='description' content='" + ($desc -replace "'", "&#39;") + "'/>"
  $htmlBuilder += '</head>'
  $htmlBuilder += '<body>'
  $htmlBuilder += "  <header class='site-header'><div class='container'><h1><a href='index.html'>AutoLearnPro</a></h1><nav><a href='index.html'>Home</a> <a href='courses.html'>Courses</a> <a href='architecture.html'>Architecture</a></nav></div></header>"
  $htmlBuilder += "  <main class='container'><article><div class='course-row'><img class='thumb' src='$($c.thumbnail)' alt='$($c.title) thumbnail'><div><h2>$($c.title)</h2><p class='muted'>$($c.level) • $($c.lessons) lessons</p></div></div>"
  $htmlBuilder += "<section><h3>Overview</h3><p>" + ($desc -replace "`r`n|`n"," `n") + "</p></section>"
  $htmlBuilder += '<section><h3>Modules</h3><ol>'
  foreach ($m in $c.modules) { $htmlBuilder += "  <li>$m</li>" }
  $htmlBuilder += '</ol></section>'
  $htmlBuilder += '<section><h3>Learning Outcomes</h3><ul>'
  foreach ($o in $learning_outcomes) { $htmlBuilder += "  <li>$o</li>" }
  $htmlBuilder += '</ul></section>'
  $htmlBuilder += "<p><a class='btn' href='courses.html'>Back to courses</a></p></article></main>"
  $htmlBuilder += "<footer class='site-footer'><div class='container'>© 2025 AutoLearnPro</div></footer>"
  $htmlBuilder += '</body>'
  $htmlBuilder += '</html>'

  $outFile = Join-Path $outDir ($c.key + '.html')
  $htmlBuilder -join "`n" | Out-File -FilePath $outFile -Encoding UTF8
  Write-Host "Wrote: $outFile" -ForegroundColor Green

  # stage and commit
  git -C (Get-Location) add $outFile
  git -C (Get-Location) commit -m "Add generated course page: $($c.title)" 2>$null | Out-Null
}

Write-Host 'All done.' -ForegroundColor Cyan
