#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Simple stress test for LMS API
.PARAMETER ApiUrl
    Base URL of the API
.PARAMETER DurationSeconds
    Test duration in seconds
.PARAMETER Concurrency
    Number of concurrent threads
#>

param(
    [string]$ApiUrl = "http://localhost:4000",
    [int]$DurationSeconds = 60,
    [int]$Concurrency = 5
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "LMS API Stress Test" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "API URL: $ApiUrl"
Write-Host "Duration: $DurationSeconds seconds"
Write-Host "Concurrency: $Concurrency threads"
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Test API connectivity
Write-Host "Testing API connectivity..." -ForegroundColor Yellow
try {
    $testResponse = Invoke-WebRequest -Uri "$ApiUrl/api/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "✓ API is accessible (Status: $($testResponse.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "✗ Cannot reach API: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Shared statistics (thread-safe)
$stats = [hashtable]::Synchronized(@{
    TotalRequests = 0
    SuccessfulRequests = 0
    FailedRequests = 0
    ResponseTimes = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
})

# Worker script
$workerScript = {
    param($ApiUrl, $DurationSeconds, $StatsRef)
    
    $endTime = (Get-Date).AddSeconds($DurationSeconds)
    $localRequests = 0
    $localSuccess = 0
    $localFailed = 0
    
    while ((Get-Date) -lt $endTime) {
        $url = "$ApiUrl/api/health"
        $startTime = Get-Date
        
        try {
            $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 -UseBasicParsing
            $responseTime = ((Get-Date) - $startTime).TotalMilliseconds
            
            $null = $StatsRef.ResponseTimes.Add($responseTime)
            [System.Threading.Interlocked]::Increment([ref]$StatsRef.TotalRequests)
            [System.Threading.Interlocked]::Increment([ref]$StatsRef.SuccessfulRequests)
            $localSuccess++
            
        } catch {
            [System.Threading.Interlocked]::Increment([ref]$StatsRef.TotalRequests)
            [System.Threading.Interlocked]::Increment([ref]$StatsRef.FailedRequests)
            $localFailed++
        }
        
        $localRequests++
        Start-Sleep -Milliseconds 10
    }
    
    return @{
        Requests = $localRequests
        Success = $localSuccess
        Failed = $localFailed
    }
}

# Create runspaces
Write-Host "Starting $Concurrency worker threads..." -ForegroundColor Yellow
$runspacePool = [runspacefactory]::CreateRunspacePool(1, $Concurrency)
$runspacePool.Open()

$runspaces = @()
for ($i = 1; $i -le $Concurrency; $i++) {
    $ps = [powershell]::Create()
    $null = $ps.AddScript($workerScript).AddArgument($ApiUrl).AddArgument($DurationSeconds).AddArgument($stats)
    $ps.RunspacePool = $runspacePool
    
    $runspaces += [PSCustomObject]@{
        Id = $i
        PowerShell = $ps
        Handle = $ps.BeginInvoke()
    }
    
    Write-Host "  Worker $i started" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Test running..." -ForegroundColor Yellow
Write-Host ""

# Progress monitoring
$startTime = Get-Date
$lastReport = $startTime

while ($runspaces | Where-Object { -not $_.Handle.IsCompleted }) {
    Start-Sleep -Seconds 5
    
    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    $currentTotal = $stats.TotalRequests
    $currentSuccess = $stats.SuccessfulRequests
    $rate = if ($elapsed -gt 0) { [math]::Round($currentTotal / $elapsed, 2) } else { 0 }
    $successPct = if ($currentTotal -gt 0) { [math]::Round(($currentSuccess / $currentTotal) * 100, 2) } else { 0 }
    
    Write-Host "[Progress] Elapsed: $([math]::Round($elapsed, 1))s | Requests: $currentTotal | Rate: $rate req/s | Success: $successPct%" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Test completed. Collecting results..." -ForegroundColor Yellow

# Collect results
$workerResults = @()
foreach ($rs in $runspaces) {
    $result = $rs.PowerShell.EndInvoke($rs.Handle)
    if ($result) {
        $workerResults += $result
    }
    $rs.PowerShell.Dispose()
}

$runspacePool.Close()
$runspacePool.Dispose()

$actualDuration = ((Get-Date) - $startTime).TotalSeconds

# Calculate stats
$responseTimes = $stats.ResponseTimes.ToArray()
$sortedTimes = $responseTimes | Sort-Object

$avgResponseTime = if ($responseTimes.Count -gt 0) { ($responseTimes | Measure-Object -Average).Average } else { 0 }
$minResponseTime = if ($responseTimes.Count -gt 0) { ($responseTimes | Measure-Object -Minimum).Minimum } else { 0 }
$maxResponseTime = if ($responseTimes.Count -gt 0) { ($responseTimes | Measure-Object -Maximum).Maximum } else { 0 }
$p50 = if ($sortedTimes.Count -gt 0) { $sortedTimes[[int]($sortedTimes.Count * 0.50)] } else { 0 }
$p95 = if ($sortedTimes.Count -gt 0) { $sortedTimes[[int]($sortedTimes.Count * 0.95)] } else { 0 }
$p99 = if ($sortedTimes.Count -gt 0) { $sortedTimes[[int]($sortedTimes.Count * 0.99)] } else { 0 }

# Display results
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "STRESS TEST RESULTS" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Test Configuration:" -ForegroundColor Yellow
Write-Host "  API URL:              $ApiUrl"
Write-Host "  Duration:             $DurationSeconds seconds (actual: $([math]::Round($actualDuration, 2))s)"
Write-Host "  Workers:              $Concurrency"
Write-Host ""

$totalReqs = $stats.TotalRequests
$successReqs = $stats.SuccessfulRequests
$failedReqs = $stats.FailedRequests

Write-Host "Request Statistics:" -ForegroundColor Yellow
Write-Host "  Total Requests:       $totalReqs"

if ($totalReqs -gt 0) {
    Write-Host "  Successful:           $successReqs ($([math]::Round(($successReqs/$totalReqs)*100, 2))%)" -ForegroundColor Green
    Write-Host "  Failed:               $failedReqs ($([math]::Round(($failedReqs/$totalReqs)*100, 2))%)" -ForegroundColor $(if ($failedReqs -gt 0) { "Red" } else { "Gray" })
}
Write-Host ""

Write-Host "Performance Metrics:" -ForegroundColor Yellow
Write-Host "  Requests/Second:      $([math]::Round($totalReqs / $actualDuration, 2))"

if ($responseTimes.Count -gt 0) {
    Write-Host "  Avg Response Time:    $([math]::Round($avgResponseTime, 2)) ms"
    Write-Host "  Min Response Time:    $([math]::Round($minResponseTime, 2)) ms"
    Write-Host "  Max Response Time:    $([math]::Round($maxResponseTime, 2)) ms"
    Write-Host "  P50 (Median):         $([math]::Round($p50, 2)) ms"
    Write-Host "  P95:                  $([math]::Round($p95, 2)) ms"
    Write-Host "  P99:                  $([math]::Round($p99, 2)) ms"
}
Write-Host ""

Write-Host "Worker Summary:" -ForegroundColor Yellow
$i = 1
foreach ($result in $workerResults) {
    Write-Host "  Worker $i : $($result.Requests) requests ($($result.Success) success, $($result.Failed) failed)"
    $i++
}
Write-Host ""

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Summary
if ($totalReqs -eq 0) {
    Write-Host "✗ No requests completed!" -ForegroundColor Red
    exit 2
} elseif ($failedReqs -eq 0) {
    Write-Host "✓ Test completed successfully with 0 failures!" -ForegroundColor Green
    Write-Host "  The API handled $totalReqs requests at $([math]::Round($totalReqs / $actualDuration, 2)) req/s" -ForegroundColor Green
    exit 0
} elseif ($failedReqs / $totalReqs -lt 0.05) {
    Write-Host "✓ Test completed with acceptable failure rate (<5%)" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ Test completed with high failure rate (>5%)" -ForegroundColor Red
    exit 2
}
