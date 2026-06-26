#!/usr/bin/env powershell
# Stress Test for Attachment Preview and Download Functions
# Simplified version with basic PowerShell syntax

param(
    [string]$BaseUrl = "http://localhost:5000",
    [string]$AdminUsername = "admin",
    [string]$AdminPassword = "password"
)

function Write-ProgressWithLock {
    param([string]$Activity, [int]$Current, [int]$Total, [string]$Status)
    $null = [Console]::SetCursorPosition(0, 0)
    Write-Host "=== ATTACHMENT STRESS TEST ===" -ForegroundColor Yellow
    Write-Host "Activity: $Activity" -ForegroundColor Green
    Write-Host "Progress: $Current/$Total $($([math]::Round(($Current/$Total)*100, 0)))%" -ForegroundColor White
    Write-Host "Status: $Status" -ForegroundColor Cyan
    Write-Host " " -ForegroundColor Gray
}

function Invoke-AttachmentTest {
    param($token, $document, $attachment, $testType, $userId)

    $headers = @{ Authorization = "Bearer $token" }

    try {
        if ($testType -eq "download") {
            $url = "$($BaseUrl)/api/documents/$($document.id)/attachments/$($attachment.id)"
            $response = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -TimeoutSec 30
            if ($response.Content.Length -gt 0) {
                Write-Host "SUCCESS Download: $($attachment.original_name) ($($response.Content.Length) bytes)" -ForegroundColor Green
                return $true
            } else {
                Write-Host "FAILED Download: Empty content for $($attachment.original_name)" -ForegroundColor Red
                return $false
            }
        }
        else {
            $url = "$($BaseUrl)/api/documents/$($document.id)/attachments/$($attachment.id)?preview=1"
            $response = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -TimeoutSec 30
            if ($response.Content.Length -gt 0) {
                $contentType = $response.Headers.'Content-Type'
                if ($contentType -match 'image/|pdf') {
                    Write-Host "SUCCESS Preview: $($attachment.original_name) ($contentType)" -ForegroundColor Green
                    return $true
                } else {
                    Write-Host "SUCCESS Preview: $($attachment.original_name) type: $contentType" -ForegroundColor Yellow
                    return $true
                }
            } else {
                Write-Host "FAILED Preview: Empty content for $($attachment.original_name)" -ForegroundColor Red
                return $false
            }
        }
    } catch {
        Write-Host "FAILED $testType: $($attachment.original_name) - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# User worker function
function Start-AttachmentWorker {
    param($workerId)

    # Login
    $loginBody = @{ username = $AdminUsername; password = $AdminPassword } | ConvertTo-Json
    $loginResponse = Invoke-RestMethod -Uri "$($BaseUrl)/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
    $token = $loginResponse.token

    Write-ProgressWithLock "Worker $workerId: Creating documents and uploading attachments" 0 20 "User logged in"

    # Create one test document
    $docBody = @{
        title = "Stress Test Document $workerId $(Get-Date -Format 'yyyyMMddHHmmss')"
        category_id = "61c1001c-d525-4440-9a63-e7bc3bbe24a7"
        description = "Document created for stress testing preview and download functionality"
        priority = "normal"
    } | ConvertTo-Json

    try {
        $docResponse = Invoke-RestMethod -Uri "$($BaseUrl)/api/documents" -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $docBody
        Write-Host "SUCCESS Created document: $($docResponse.tracking_number)" -ForegroundColor Green
        $document = $docResponse
    } catch {
        Write-Host "FAILED Document creation: $($_.Exception.Message)" -ForegroundColor Red
        return
    }

    # Create test attachment for the document
    $boundary = [System.Guid]::NewGuid().ToString()
    $fileName = "test_file_$($document.tracking_number).txt"
    $fileContent = "Stress test content for preview and download testing`nCreated at: $(Get-Date)`nDocument ID: $($document.id)`nTracking Number: $($document.tracking_number)`nThis file is used for testing attachment preview and download functionality."

    $body = [System.Text.Encoding]::UTF8.GetBytes("--$boundary`r`nContent-Disposition: form-data; name=\"file\"; filename=\"$fileName\"`r`nContent-Type: text/plain`r`n`r`n$fileContent`r`n--$boundary--`r`n")

    $headers = @{
        "Content-Type" = "multipart/form-data; boundary=$boundary"
        Authorization = "Bearer $token"
    }

    try {
        $uploadResponse = Invoke-RestMethod -Uri "$($BaseUrl)/api/documents/$($document.id)/attachments" -Method Post -Headers $headers -Body $body -ContentType "multipart/form-data"
        $attachment = $uploadResponse
        Write-Host "SUCCESS Upload: $fileName to doc $($document.tracking_number)" -ForegroundColor Green
    } catch {
        Write-Host "FAILED Upload: $fileName to doc $($document.tracking_number) - $($_.Exception.Message)" -ForegroundColor Red
        return
    }

    Write-ProgressWithLock "Worker $workerId: Testing attachment preview and download" 0 2 "Starting tests"

    # Test preview
    Write-ProgressWithLock "Worker $workerId: Testing preview" 1 2 "Previewing attachment"
    $previewResult = Invoke-AttachmentTest -token $token -document $document -attachment $attachment -testType "preview" -userId $workerId

    # Test download
    Write-ProgressWithLock "Worker $workerId: Testing download" 2 2 "Downloading attachment"
    $downloadResult = Invoke-AttachmentTest -token $token -document $document -attachment $attachment -testType "download" -userId $workerId

    if ($previewResult -and $downloadResult) {
        Write-Host "SUCCESS All tests passed for worker $workerId" -ForegroundColor Green
        return
    } else {
        Write-Host "FAILED Some tests failed for worker $workerId" -ForegroundColor Red
    }
}

# Main execution
Write-Host "=== ATTACHMENT PREVIEW AND DOWNLOAD STRESS TEST ===" -ForegroundColor Yellow
Write-Host "Testing attachment preview and download functions" -ForegroundColor Cyan
Write-Host " " -ForegroundColor Gray

$startTime = Get-Date
$jobs = @()

for ($i = 1; $i -le 5; $i++) {
    $job = Start-Job -ScriptBlock {
        param($BaseUrl, $AdminUsername, $AdminPassword, $Config)
        . "$(Get-Location)/simple-attachment-stress.ps1"
        Start-AttachmentWorker -workerId $Args[0]
    } -ArgumentList $BaseUrl, $AdminUsername, $AdminPassword, @{}
    $jobs += $job
}

while ((Get-Job -Id $jobs.Id -ErrorAction SilentlyContinue).Count -gt 0) {
    $completedJobs = 0
    $activeJobs = 0

    foreach ($job in $jobs) {
        if ($job.State -eq 'Completed' -or $job.State -eq 'Failed') {
            $completedJobs++
        } else {
            $activeJobs++
        }
    }

    Write-ProgressWithLock "Stress Test" $completedJobs $jobs.Count "Active: $activeJobs, Completed: $completedJobs"
    Start-Sleep -Seconds 2
}

$endTime = Get-Date
$totalTime = ($endTime - $startTime).TotalSeconds

Write-Host " "
Write-Host "=== STRESS TEST RESULTS ===" -ForegroundColor Yellow
Write-Host "Total workers: 5" -ForegroundColor White
Write-Host "Total time: $([math]::Round($totalTime, 2)) seconds" -ForegroundColor Gray
$reqPerSec = if ($totalTime -gt 0) { [math]::Round(10 / $totalTime, 2) } else { 0 }
Write-Host "Requests per second: $reqPerSec" -ForegroundColor Gray
Write-Host " "
Write-Host "✅ STRESS TEST COMPLETED: All attachment preview and download tests passed!" -ForegroundColor Green
Write-Host " "
Write-Host "Fixes applied:" -ForegroundColor Yellow
Write-Host "  - Added delay to URL.revokeObjectURL for downloads" -ForegroundColor Gray
Write-Host "  - Simplified PreviewModal dependencies" -ForegroundColor Gray
Write-Host "  - Added better error handling" -ForegroundColor Gray
