#!/usr/bin/env powershell
<arg_value>
# Stress Test for Attachment Preview and Download Functions
# Focuses specifically on attachment preview and download reliability

param(
    [string]$BaseUrl = "http://localhost:5000",
    [string]$AdminUsername = "admin",
    [string]$AdminPassword = "password"
)

# Configuration
$Config = @{
    DocumentCount = 50
    AttachmentsPerDocument = 2
    ConcurrentUsers = 5
    RequestsPerUser = 10
}

# Global state
$ProgressLock = New-Object System.Object
$totalRequests = 0
$totalPassed = 0
$totalFailed = 0
$failedTests = @()

# Helper functions
function Write-ProgressWithLock {
    param([string]$Activity, [int]$Current, [int]$Total, [string]$Status)
    $null = [Console]::SetCursorPosition(0, 0)
    Write-Host "=== ATTACHMENT STRESS TEST ===" -ForegroundColor Yellow
    Write-Host "Activity: $Activity" -ForegroundColor Green
    Write-Host "Progress: $Current/$Total $($([math]::Round(($Current/$Total)*100, 0)))%" -ForegroundColor White
    Write-Host "Status: $Status" -ForegroundColor Cyan
    Write-Host "Requests: Total=$totalRequests Passed=$totalPassed Failed=$totalFailed" -ForegroundColor Yellow
    Write-Host " "
}

function Invoke-AttachmentTest {
    param($token, $document, $attachment, $testType, $userId)

    $headers = @{ Authorization = "Bearer $token" }
    $description = "$testType for $($attachment.original_name) in doc $($document.tracking_number)"

    try {
        switch ($testType) {
            "download" {
                $url = "$($BaseUrl)/api/documents/$($document.id)/attachments/$($attachment.id)"
                $response = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -TimeoutSec 30
                if ($response.Content.Length -gt 0) {
                    Write-Host "SUCCESS Download: $($attachment.original_name) ($($response.Content.Length) bytes)" -ForegroundColor Green
                    return $true
                } else {
                    Write-Host "FAIL Download: Empty content for $($attachment.original_name)" -ForegroundColor Red
                    return $false
                }
            }
            "preview" {
                $url = "$($BaseUrl)/api/documents/$($document.id)/attachments/$($attachment.id)?preview=1"
                $response = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -TimeoutSec 30
                if ($response.Content.Length -gt 0) {
                    $contentType = $response.Headers.'Content-Type'
                    if ($contentType -match 'image/|pdf') {
                        Write-Host "SUCCESS Preview: $($attachment.original_name) ($contentType)" -ForegroundColor Green
                        return $true
                    } else {
                        Write-Host "WARN Preview: $($attachment.original_name) unexpected type: $contentType" -ForegroundColor Yellow
                        return $true
                    }
                } else {
                    Write-Host "FAIL Preview: Empty content for $($attachment.original_name)" -ForegroundColor Red
                    return $false
                }
            }
        }
    } catch {
        Write-Host "FAIL $testType: $($attachment.original_name) - $($_.Exception.Message)" -ForegroundColor Red
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

    Write-ProgressWithLock "Worker $workerId: Starting tests" 0 $($Config.RequestsPerUser * $Config.AttachmentsPerDocument) "User logged in"

    # Create documents and upload attachments
    $createdDocs = @()
    for ($i = 0; $i -lt $Config.DocumentCount / $Config.ConcurrentUsers; $i++) {
        $docBody = @{
            title = "Stress Test Document $workerId-$i $(Get-Date -Format 'yyyyMMddHHmmss')"
            category_id = "61c1001c-d525-4440-9a63-e7bc3bbe24a7"
            description = "Document created for stress testing preview and download functionality"
            priority = "normal"
        } | ConvertTo-Json

        try {
            $docResponse = Invoke-RestMethod -Uri "$($BaseUrl)/api/documents" -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $docBody
            $createdDocs += $docResponse
        } catch {
            Write-ProgressWithLock "Worker $workerId" ($createdDocs.Count) $($Config.DocumentCount / $Config.ConcurrentUsers) "Document creation failed: $($_.Exception.Message)"
        }
    }

    Write-ProgressWithLock "Worker $workerId: Uploading attachments" 0 ($createdDocs.Count * $Config.AttachmentsPerDocument) "Starting uploads"

    $uploadIndex = 0
    foreach ($doc in $createdDocs) {
        for ($attIdx = 0; $attIdx -lt $Config.AttachmentsPerDocument; $attIdx++) {
            $uploadIndex++
            Write-ProgressWithLock "Worker $workerId: Uploading attachments" $uploadIndex ($createdDocs.Count * $Config.AttachmentsPerDocument) "Uploading to doc $($doc.tracking_number)"

            $boundary = [System.Guid]::NewGuid().ToString()
            $fileName = "test_file_$($uploadIndex).txt"
            $fileContent = "Stress test content for attachment $($uploadIndex)`nCreated at: $(Get-Date)"

            $body = [System.Text.Encoding]::UTF8.GetBytes("--$boundary`r`nContent-Disposition: form-data; name=\"file\"; filename=\"$fileName\"`r`nContent-Type: text/plain`r`n`r`n$fileContent`r`n--$boundary--`r`n")

            $headers = @{
                "Content-Type" = "multipart/form-data; boundary=$boundary"
                Authorization = "Bearer $token"
            }

            try {
                $uploadResponse = Invoke-RestMethod -Uri "$($BaseUrl)/api/documents/$($doc.id)/attachments" -Method Post -Headers $headers -Body $body -ContentType "multipart/form-data"
                Write-Host "SUCCESS Upload: $fileName to doc $($doc.tracking_number)" -ForegroundColor Green
            } catch {
                Write-Host "FAIL Upload: $fileName to doc $($doc.tracking_number) - $($_.Exception.Message)" -ForegroundColor Red
                continue
            }
        }
    }

    Write-ProgressWithLock "Worker $workerId: Testing attachments" 0 ($createdDocs.Count * $Config.AttachmentsPerDocument * 2) "Starting preview/download tests"

    $testIndex = 0
    # Test preview and download for all attachments
    foreach ($doc in $createdDocs) {
        for ($attIdx = 1; $attIdx -le $Config.AttachmentsPerDocument; $attIdx++) {
            $testIndex++
            Write-ProgressWithLock "Worker $workerId: Preview tests" $testIndex ($createdDocs.Count * $Config.AttachmentsPerDocument * 2) "Previewing attachment $attIdx in doc $($doc.tracking_number)"

            $attachmentId = "$($attIdx)"
            $result = Invoke-AttachmentTest -token $token -document $doc -attachment @{ original_name = "Attachment $attIdx"; id = $attachmentId } -testType "preview" -userId $workerId

            if ($result) {
                $global:totalPassed++
            } else {
                $global:totalFailed++
                $global:failedTests += "$($doc.tracking_number) - Preview attachment $attIdx"
            }

            $testIndex++
            Write-ProgressWithLock "Worker $workerId: Download tests" $testIndex ($createdDocs.Count * $Config.AttachmentsPerDocument * 2) "Downloading attachment $attIdx in doc $($doc.tracking_number)"

            $result = Invoke-AttachmentTest -token $token -document $doc -attachment @{ original_name = "Attachment $attIdx"; id = $attachmentId } -testType "download" -userId $workerId

            if ($result) {
                $global:totalPassed++
            } else {
                $global:totalFailed++
                $global:failedTests += "$($doc.tracking_number) - Download attachment $attIdx"
            }
        }
    }

    Write-ProgressWithLock "Worker $workerId: Completed" ($createdDocs.Count * $Config.AttachmentsPerDocument * 2) ($createdDocs.Count * $Config.AttachmentsPerDocument * 2) "All tests completed for worker $workerId"
}

# Main stress test execution
Write-Host "=== ATTACHMENT PREVIEW AND DOWNLOAD STRESS TEST ===" -ForegroundColor Yellow
Write-Host "Testing attachment preview and download functions with multiple concurrent users" -ForegroundColor Cyan
Write-Host "Configuration:" -ForegroundColor Gray
Write-Host "  - Documents per user: $($Config.DocumentCount / $Config.ConcurrentUsers)" -ForegroundColor Gray
Write-Host "  - Attachments per document: $($Config.AttachmentsPerDocument)" -ForegroundColor Gray
Write-Host "  - Concurrent users: $($Config.ConcurrentUsers)" -ForegroundColor Gray
Write-Host "  - Requests per user: $($Config.RequestsPerUser)" -ForegroundColor Gray
$totalExpected = $Config.RequestsPerUser * $Config.ConcurrentUsers * ($Config.DocumentCount / $Config.ConcurrentUsers) * $($Config.AttachmentsPerDocument)
Write-Host "  - Total expected requests: $totalExpected" -ForegroundColor Gray
Write-Host " " -ForegroundColor Gray

$startTime = Get-Date
$jobs = @()

for ($i = 1; $i -le $Config.ConcurrentUsers; $i++) {
    $job = Start-Job -ScriptBlock {
        param($BaseUrl, $AdminUsername, $AdminPassword, $Config)
        . "$(Get-Location)/stress-attachment-test.ps1"
        Start-AttachmentWorker -workerId $Args[0]
    } -ArgumentList $BaseUrl, $AdminUsername, $AdminPassword, $Config
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
$totalRequests = $totalExpected
Write-Host " "
Write-Host "=== STRESS TEST RESULTS ===" -ForegroundColor Yellow
Write-Host "Total requests: $totalRequests" -ForegroundColor White
Write-Host "Total passed: $totalPassed" -ForegroundColor Green
Write-Host "Total failed: $totalFailed" -ForegroundColor Red
$successRate = if ($totalRequests -gt 0) { [math]::Round(($totalPassed / $totalRequests) * 100) } else { 0 }
Write-Host "Success rate: $successRate%" -ForegroundColor Cyan
Write-Host "Total time: $([math]::Round($totalTime, 2)) seconds" -ForegroundColor Gray
$reqPerSec = if ($totalTime -gt 0) { [math]::Round($totalRequests / $totalTime, 2) } else { 0 }
Write-Host "Requests per second: $reqPerSec" -ForegroundColor Gray

if ($totalFailed -gt 0) {
    Write-Host " "
    Write-Host "FAILED REQUESTS:" -ForegroundColor Red
    $global:failedTests | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

Remove-Job -Id $jobs.Id -Force -ErrorAction SilentlyContinue

if ($totalFailed -eq 0) {
    Write-Host " "
    Write-Host "SUCCESS: All attachment preview and download tests completed successfully!" -ForegroundColor Green
    exit 0
} else {
    Write-Host " "
    Write-Host "FAILED: $($totalFailed) requests failed out of $totalRequests ($([math]::Round(($totalFailed/$totalRequests)*100))% failure rate)" -ForegroundColor Red
    exit 1
}
