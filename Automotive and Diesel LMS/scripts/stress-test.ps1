#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stress test the LMS API for a specified duration
.DESCRIPTION
    This script performs a stress test by sending concurrent requests to the LMS API endpoints
.PARAMETER ApiUrl
    Base URL of the API (default: http://localhost:4000)
.PARAMETER DurationSeconds
    How long to run the test in seconds (default: 60)
.PARAMETER Concurrency
    Number of concurrent threads (default: 5)
#>

param(
    [string]$ApiUrl = "http://localhost:4000",
    [int]$DurationSeconds = 60,
    [int]$Concurrency = 5
)

$ErrorActionPreference = "Continue"

# Test configuration
$endpoints = @(
    @{ Method = "GET"; Path = "/api/health"; RequiresAuth = $false }
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "LMS API Stress Test" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "API URL: $ApiUrl"
Write-Host "Duration: $DurationSeconds seconds"
Write-Host "Concurrency: $Concurrency workers"
Write-Host "Target Rate: $($Concurrency * $RequestsPerWorker) requests/second"
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Statistics tracking
$stats = [PSCustomObject]@{
    TotalRequests = 0
    SuccessfulRequests = 0
    FailedRequests = 0
    TotalResponseTime = 0.0
    MinResponseTime = [double]::MaxValue
    MaxResponseTime = 0.0
    StatusCodes = @{}
    Errors = @{}
}

$statsLock = [System.Object]::new()

# Worker function
$workerScript = {
    param(
        $ApiUrl,
        $Endpoints,
        $WorkerId,
        $DurationSeconds,
        $RequestsPerWorker,
        $StatsRef,
        $StatsLock
    )
    
    $endTime = (Get-Date).AddSeconds($DurationSeconds)
    $delayMs = [Math]::Max(1, [int](1000 / $RequestsPerWorker))
    $localStats = @{
        Total = 0
        Success = 0
        Failed = 0
    }
    
    while ((Get-Date) -lt $endTime) {
        foreach ($endpoint in $Endpoints) {
            if ((Get-Date) -ge $endTime) { break }
            
            $url = "$ApiUrl$($endpoint.Path)"
            $startTime = Get-Date
            
            try {
                $response = Invoke-WebRequest -Uri $url -Method $endpoint.Method -TimeoutSec 10 -ErrorAction Stop
                $endTime2 = Get-Date
                $responseTime = ($endTime2 - $startTime).TotalMilliseconds
                
                # Update stats under lock
                [System.Threading.Monitor]::Enter($StatsLock)
                try {
                    $StatsRef.TotalRequests++
                    $StatsRef.SuccessfulRequests++
                    $StatsRef.TotalResponseTime += $responseTime
                    
                    if ($responseTime -lt $StatsRef.MinResponseTime) {
                        $StatsRef.MinResponseTime = $responseTime
                    }
                    if ($responseTime -gt $StatsRef.MaxResponseTime) {
                        $StatsRef.MaxResponseTime = $responseTime
                    }
                    
                    $statusCode = $response.StatusCode
                    if (-not $StatsRef.StatusCodes.ContainsKey($statusCode)) {
                        $StatsRef.StatusCodes[$statusCode] = 0
                    }
                    $StatsRef.StatusCodes[$statusCode]++
                } finally {
                    [System.Threading.Monitor]::Exit($StatsLock)
                }
                
                $localStats.Success++
                
            } catch {
                [System.Threading.Monitor]::Enter($StatsLock)
                try {
                    $StatsRef.TotalRequests++
                    $StatsRef.FailedRequests++
                    
                    $errorMsg = $_.Exception.Message
                    if (-not $StatsRef.Errors.ContainsKey($errorMsg)) {
                        $StatsRef.Errors[$errorMsg] = 0
                    }
                    $StatsRef.Errors[$errorMsg]++
                } finally {
                    [System.Threading.Monitor]::Exit($StatsLock)
                }
                
                $localStats.Failed++
            }
            
            $localStats.Total++
            
            # Small delay to control request rate
            Start-Sleep -Milliseconds $delayMs
        }
    }
    
    return $localStats
}

# Start all workers
Write-Host "Starting $Concurrency worker threads..." -ForegroundColor Yellow
$jobs = @()

for ($i = 1; $i -le $Concurrency; $i++) {
    $job = Start-Job -ScriptBlock $workerScript -ArgumentList @(
        $ApiUrl,
        $endpoints,
        $i,
        $DurationSeconds,
        $RequestsPerWorker,
        $stats,
        $statsLock
    )
    $jobs += $job
    Write-Host "  Worker $i started (Job ID: $($job.Id))" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Test running for $DurationSeconds seconds..." -ForegroundColor Yellow
Write-Host ""

# Progress monitoring
$startTime = Get-Date
$lastReportTime = $startTime

while ((Get-Date) -lt $startTime.AddSeconds($DurationSeconds)) {
    Start-Sleep -Milliseconds 5000
    
    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    $remaining = $DurationSeconds - $elapsed
    
    if ((Get-Date) -ge $lastReportTime.AddSeconds(5)) {
        $currentRate = if ($elapsed -gt 0) { [math]::Round($stats.TotalRequests / $elapsed, 2) } else { 0 }
        $successRate = if ($stats.TotalRequests -gt 0) { [math]::Round(($stats.SuccessfulRequests / $stats.TotalRequests) * 100, 2) } else { 0 }
        
        Write-Host "[Progress] Elapsed: $([math]::Round($elapsed, 1))s | Requests: $($stats.TotalRequests) | Rate: $currentRate req/s | Success: $successRate%" -ForegroundColor Cyan
        $lastReportTime = Get-Date
    }
}

Write-Host ""
Write-Host "Test duration completed. Waiting for workers to finish..." -ForegroundColor Yellow

# Wait for all jobs to complete
$jobs | Wait-Job | Out-Null

# Collect results
$workerResults = @()
foreach ($job in $jobs) {
    $result = Receive-Job -Job $job
    if ($result) {
        $workerResults += $result
    }
    Remove-Job -Job $job
}

$actualDuration = ((Get-Date) - $startTime).TotalSeconds

# Display final results
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

Write-Host "Request Statistics:" -ForegroundColor Yellow
Write-Host "  Total Requests:       $($stats.TotalRequests)"
Write-Host "  Successful:           $($stats.SuccessfulRequests) ($([math]::Round(($stats.SuccessfulRequests/$stats.TotalRequests)*100, 2))%)" -ForegroundColor Green
Write-Host "  Failed:               $($stats.FailedRequests) ($([math]::Round(($stats.FailedRequests/$stats.TotalRequests)*100, 2))%)" -ForegroundColor Red
Write-Host ""

Write-Host "Performance Metrics:" -ForegroundColor Yellow
Write-Host "  Requests/Second:      $([math]::Round($stats.TotalRequests / $actualDuration, 2))"
if ($stats.SuccessfulRequests -gt 0) {
    $avgResponseTime = $stats.TotalResponseTime / $stats.SuccessfulRequests
    Write-Host "  Avg Response Time:    $([math]::Round($avgResponseTime, 2)) ms"
    Write-Host "  Min Response Time:    $([math]::Round($stats.MinResponseTime, 2)) ms"
    Write-Host "  Max Response Time:    $([math]::Round($stats.MaxResponseTime, 2)) ms"
}
Write-Host ""

if ($stats.StatusCodes.Count -gt 0) {
    Write-Host "HTTP Status Codes:" -ForegroundColor Yellow
    foreach ($code in ($stats.StatusCodes.Keys | Sort-Object)) {
        Write-Host "  $code : $($stats.StatusCodes[$code]) requests"
    }
    Write-Host ""
}

if ($stats.Errors.Count -gt 0) {
    Write-Host "Error Summary:" -ForegroundColor Red
    $errorList = $stats.Errors.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 10
    foreach ($error in $errorList) {
        Write-Host "  $($error.Value)x - $($error.Key)"
    }
    Write-Host ""
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Summary verdict
if ($stats.FailedRequests -eq 0) {
    Write-Host "✓ Test completed successfully with 0 failures!" -ForegroundColor Green
    exit 0
} elseif ($stats.FailedRequests / $stats.TotalRequests -lt 0.01) {
    Write-Host "✓ Test completed with minimal failures (<1%)" -ForegroundColor Green
    exit 0
} elseif ($stats.FailedRequests / $stats.TotalRequests -lt 0.05) {
    Write-Host "⚠ Test completed with some failures (<5%)" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✗ Test completed with significant failures (>5%)" -ForegroundColor Red
    exit 2
}
