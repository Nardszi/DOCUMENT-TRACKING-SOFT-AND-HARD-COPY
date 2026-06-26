# NONECO DTS Load Test - 1000 Documents (PS 5.1 compatible)
param(
  [int]$TOTAL_DOCS = 1000,
  [int]$BATCH_SIZE = 50
)

$ErrorActionPreference = 'Continue'
$BASE = 'http://localhost:5000/api'
$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Log($msg) { Write-Output "[$(Get-Date -Format 'HH:mm:ss')] $msg" }

function Invoke-JsonPost($url, $body, $token) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = 'POST'
    $req.ContentType = 'application/json'
    $req.ContentLength = $bytes.Length
    if ($token) { $req.Headers.Add("Authorization", "Bearer $token") }
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    try {
        $resp = $req.GetResponse()
        $reader = [System.IO.StreamReader]::new($resp.GetResponseStream())
        $data = $reader.ReadToEnd()
        $reader.Close(); $resp.Close()
        return @{ Ok = $true; Data = ($data | ConvertFrom-Json); Status = 200 }
    } catch {
        $e = $_.Exception.Response
        if ($e) {
            $sr = [System.IO.StreamReader]::new($e.GetResponseStream())
            $errData = $sr.ReadToEnd(); $sr.Close(); $e.Close()
            return @{ Ok = $false; Data = $errData; Status = [int]$e.StatusCode }
        }
        return @{ Ok = $false; Data = $_.Exception.Message; Status = 0 }
    }
}

function Invoke-JsonGet($url, $token) {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = 'GET'
    $req.Accept = 'application/json'
    if ($token) { $req.Headers.Add("Authorization", "Bearer $token") }
    try {
        $resp = $req.GetResponse()
        $reader = [System.IO.StreamReader]::new($resp.GetResponseStream())
        $data = $reader.ReadToEnd()
        $reader.Close(); $resp.Close()
        return @{ Ok = $true; Data = ($data | ConvertFrom-Json); Status = 200 }
    } catch {
        $e = $_.Exception.Response
        if ($e) { $e.Close(); return @{ Ok = $false; Data = $null; Status = [int]$e.StatusCode } }
        return @{ Ok = $false; Data = $null; Status = 0 }
    }
}

function Upload-Multipart($url, $filePath, $token) {
    $boundary = [System.Guid]::NewGuid().ToString()
    $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
    $fileName = [System.IO.Path]::GetFileName($filePath)
    
    $body = New-Object System.Text.StringBuilder
    $body.AppendLine("--$boundary") | Out-Null
    $body.AppendLine("Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"") | Out-Null
    $body.AppendLine("Content-Type: application/pdf") | Out-Null
    $body.AppendLine() | Out-Null
    
    $bodyBytes = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes($body.ToString())
    $endBytes = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes("`r`n--$boundary--`r`n")
    
    $contentLength = $bodyBytes.Length + $fileBytes.Length + $endBytes.Length
    
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = 'POST'
    $req.ContentType = "multipart/form-data; boundary=$boundary"
    $req.ContentLength = $contentLength
    if ($token) { $req.Headers.Add("Authorization", "Bearer $token") }
    
    $stream = $req.GetRequestStream()
    $stream.Write($bodyBytes, 0, $bodyBytes.Length)
    $stream.Write($fileBytes, 0, $fileBytes.Length)
    $stream.Write($endBytes, 0, $endBytes.Length)
    $stream.Close()
    
    try {
        $resp = $req.GetResponse()
        $resp.Close()
        return $true
    } catch {
        $e = $_.Exception.Response
        if ($e) { $e.Close() }
        return $false
    }
}

# ===== SETUP =====
Log "Logging in..."
$login = Invoke-JsonPost "$BASE/auth/login" '{"username":"admin","password":"password"}' $null
$TOKEN = $login.Data.token
Log "Token OK"

$catRes = Invoke-JsonGet "$BASE/categories" $TOKEN
$catIds = $catRes.Data | ForEach-Object { $_.id }
$deptRes = Invoke-JsonGet "$BASE/departments" $TOKEN
$deptId = $deptRes.Data[0].id
Log "Cats: $($catIds.Count), Dept: $deptId"

# Create test PDF
$pdfDir = "$PSScriptRoot\test-pdfs"
if (!(Test-Path $pdfDir)) { New-Item -ItemType Directory -Path $pdfDir -Force | Out-Null }
$pdfBytes = [byte[]](0x25,0x50,0x44,0x46,0x2D,0x31,0x2E,0x34,0x0A,0x25,0xE2,0xE3,0xCF,0xD3,0x0A)
$pdfBytes += [byte[]](0x31,0x20,0x30,0x20,0x6F,0x62,0x6A,0x65,0x63,0x74,0x0A,0x3C,0x3C,0x2F,0x54,0x79,0x70,0x65,0x2F,0x43,0x61,0x74,0x61,0x6C,0x6F,0x67,0x2F,0x50,0x61,0x67,0x65,0x73,0x20,0x32,0x20,0x30,0x20,0x52,0x3E,0x3E,0x0A,0x65,0x6E,0x64,0x6F,0x62,0x6A,0x0A)
$pdfBytes += [byte[]](0x32,0x20,0x30,0x20,0x6F,0x62,0x6A,0x65,0x63,0x74,0x0A,0x3C,0x3C,0x2F,0x54,0x79,0x70,0x65,0x2F,0x50,0x61,0x67,0x65,0x73,0x2F,0x4B,0x69,0x64,0x73,0x5B,0x33,0x20,0x30,0x20,0x52,0x5D,0x2F,0x43,0x6F,0x75,0x6E,0x74,0x20,0x31,0x3E,0x3E,0x0A,0x65,0x6E,0x64,0x6F,0x62,0x6A,0x0A)
$pdfBytes += [byte[]](0x33,0x20,0x30,0x20,0x6F,0x62,0x6A,0x65,0x63,0x74,0x0A,0x3C,0x3C,0x2F,0x54,0x79,0x70,0x65,0x2F,0x50,0x61,0x67,0x65,0x2F,0x50,0x61,0x72,0x65,0x6E,0x74,0x20,0x32,0x20,0x30,0x20,0x52,0x2F,0x4D,0x65,0x64,0x69,0x61,0x42,0x6F,0x78,0x5B,0x30,0x20,0x30,0x20,0x36,0x31,0x32,0x20,0x37,0x39,0x32,0x5D,0x3E,0x3E,0x0A,0x65,0x6E,0x64,0x6F,0x62,0x6A,0x0A)
$pdfBytes += [byte[]](0x78,0x72,0x65,0x66,0x0A,0x30,0x20,0x34,0x0A,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x20,0x20,0x20,0x20,0x30,0x20,0x66,0x0A)
$pdfBytes += [byte[]](0x74,0x72,0x61,0x69,0x6C,0x65,0x72,0x0A,0x3C,0x3C,0x2F,0x53,0x69,0x7A,0x65,0x20,0x34,0x2F,0x52,0x6F,0x6F,0x74,0x20,0x31,0x20,0x30,0x20,0x52,0x3E,0x3E,0x0A)
$pdfBytes += [byte[]](0x73,0x74,0x61,0x72,0x74,0x78,0x72,0x65,0x66,0x0A,0x30,0x0A,0x25,0x25,0x45,0x4F,0x46)
$pdfPath = "$pdfDir\test.pdf"
[System.IO.File]::WriteAllBytes($pdfPath, $pdfBytes)
Log "PDF ready ($($pdfBytes.Length) bytes)"

$created = 0; $failed = 0; $uploaded = 0; $uploadFailed = 0
$createdIds = @()
$errors = @()

# ===== PHASE 1: CREATE 1000 DOCUMENTS =====
Log "=== PHASE 1: Creating $TOTAL_DOCS documents ==="
$p1sw = [System.Diagnostics.Stopwatch]::StartNew()

for ($i = 0; $i -lt $TOTAL_DOCS; $i++) {
    $catId = $catIds[$i % $catIds.Count]
    $priority = @('low', 'normal', 'high', 'urgent')[$i % 4]
    $body = @{ title = "Load Test #$($i+1)"; category_id = $catId; originating_department_id = $deptId; priority = $priority; description = "Automated load test document $($i+1) of $TOTAL_DOCS" } | ConvertTo-Json
    
    $result = Invoke-JsonPost "$BASE/documents" $body $TOKEN
    if ($result.Ok) {
        $created++
        $createdIds += $result.Data.id
    } else {
        $failed++
        $errors += "Doc#$($i+1): $($result.Status) $($result.Data)"
    }
    
    if (($i + 1) % 100 -eq 0 -or $i -eq $TOTAL_DOCS - 1) {
        $elapsed = $p1sw.Elapsed.TotalSeconds
        $rate = if ($elapsed -gt 0) { [Math]::Round(($i+1) / $elapsed, 1) } else { 0 }
        Log "  Created $($i+1)/$TOTAL_DOCS ($failed failed) - $rate/s"
    }
}

$p1Time = $p1sw.Elapsed.TotalSeconds
$p1Rate = if ($p1Time -gt 0) { [Math]::Round($created / $p1Time, 1) } else { 0 }
Log "Phase 1 DONE: $created created, $failed failed in $([Math]::Round($p1Time,1))s ($p1Rate/s)"

# ===== PHASE 2: UPLOAD 500 ATTACHMENTS =====
$ATTACH_COUNT = [Math]::Min(500, $created)
Log "=== PHASE 2: Uploading $ATTACH_COUNT attachments ==="
$p2sw = [System.Diagnostics.Stopwatch]::StartNew()

for ($i = 0; $i -lt $ATTACH_COUNT; $i++) {
    $docId = $createdIds[$i]
    $ok = Upload-Multipart "$BASE/documents/$docId/attachments" $pdfPath $TOKEN
    if ($ok) { $uploaded++ } else { $uploadFailed++; $errors += "Upload#$($i+1)" }
    
    if (($i + 1) % 100 -eq 0 -or $i -eq $ATTACH_COUNT - 1) {
        $elapsed = $p2sw.Elapsed.TotalSeconds
        $rate = if ($elapsed -gt 0) { [Math]::Round(($i+1) / $elapsed, 1) } else { 0 }
        Log "  Uploaded $($i+1)/$ATTACH_COUNT ($uploadFailed failed) - $rate/s"
    }
}

$p2Time = $p2sw.Elapsed.TotalSeconds
$p2Rate = if ($p2Time -gt 0) { [Math]::Round($uploaded / $p2Time, 1) } else { 0 }
Log "Phase 2 DONE: $uploaded uploaded, $uploadFailed failed in $([Math]::Round($p2Time,1))s ($p2Rate/s)"

# ===== PHASE 3: OPERATIONS UNDER LOAD =====
Log "=== PHASE 3: Operations under load ==="
$p3sw = [System.Diagnostics.Stopwatch]::StartNew()

# Search stress
$searchOk = 0; $searchTerms = @('Load','Test','NONECO','Document','Urgent','High')
for ($i = 0; $i -lt 50; $i++) {
    $term = $searchTerms[$i % $searchTerms.Count]
    $r = Invoke-JsonGet "$BASE/documents/quick-search?q=$term" $TOKEN
    if ($r.Ok) { $searchOk++ }
}
Log "  Search: $searchOk/50"

# Dashboard stress
$dashOk = 0
for ($i = 0; $i -lt 20; $i++) {
    $r = Invoke-JsonGet "$BASE/dashboard" $TOKEN
    if ($r.Ok) { $dashOk++ }
}
Log "  Dashboard: $dashOk/20"

# Notifications
$notifOk = 0
for ($i = 0; $i -lt 20; $i++) {
    $r = Invoke-JsonGet "$BASE/notifications?limit=10" $TOKEN
    if ($r.Ok) { $notifOk++ }
}
Log "  Notifications: $notifOk/20"

# Pagination
$pageOk = 0
for ($i = 0; $i -lt 10; $i++) {
    $offset = $i * 20
    $r = Invoke-JsonGet "$BASE/documents?limit=20&offset=$offset" $TOKEN
    if ($r.Ok) { $pageOk++ }
}
Log "  Pagination: $pageOk/10"

# Reports
$rptOk = 0
foreach ($rt in @('document_volume','overdue_documents','user_activity')) {
    $body = "{`"report_type`":`"$rt`",`"date_from`":`"2026-01-01`",`"date_to`":`"2026-12-31`"}"
    $r = Invoke-JsonPost "$BASE/reports/preview" $body $TOKEN
    if ($r.Ok) { $rptOk++ }
}
Log "  Reports: $rptOk/3"

$p3Time = $p3sw.Elapsed.TotalSeconds
Log "Phase 3 DONE in $([Math]::Round($p3Time,1))s"

# ===== PHASE 4: QUERY PERFORMANCE =====
Log "=== PHASE 4: Query Performance ==="

$t1 = [System.Diagnostics.Stopwatch]::StartNew()
$r1 = Invoke-JsonGet "$BASE/documents?limit=100" $TOKEN
$t1.Stop()
Log "  List 100 docs: $([Math]::Round($t1.Elapsed.TotalMilliseconds))ms (got $($r1.Data.documents.Count) of $($r1.Data.total))"

$t2 = [System.Diagnostics.Stopwatch]::StartNew()
$r2 = Invoke-JsonGet "$BASE/dashboard" $TOKEN
$t2.Stop()
Log "  Dashboard: $([Math]::Round($t2.Elapsed.TotalMilliseconds))ms (total: $($r2.Data.counts.total))"

$t3 = [System.Diagnostics.Stopwatch]::StartNew()
$r3 = Invoke-JsonGet "$BASE/documents?limit=100&offset=900" $TOKEN
$t3.Stop()
Log "  Deep page (offset=900): $([Math]::Round($t3.Elapsed.TotalMilliseconds))ms (got $($r3.Data.documents.Count))"

$t4 = [System.Diagnostics.Stopwatch]::StartNew()
$r4 = Invoke-JsonGet "$BASE/documents?limit=100&status=completed" $TOKEN
$t4.Stop()
Log "  Filter status=completed: $([Math]::Round($t4.Elapsed.TotalMilliseconds))ms (got $($r4.Data.documents.Count))"

# ===== FINAL REPORT =====
$sw.Stop()
$totalMin = [Math]::Round($sw.Elapsed.TotalMinutes, 1)
$totalSec = [Math]::Round($sw.Elapsed.TotalSeconds, 1)

Write-Output ""
Write-Output "============================================"
Write-Output "  LOAD TEST FINAL RESULTS"
Write-Output "============================================"
Write-Output "  Total time:     ${totalMin}m (${totalSec}s)"
Write-Output ""
Write-Output "  PHASE 1 - Documents:"
Write-Output "    Created:      $created / $TOTAL_DOCS"
Write-Output "    Failed:       $failed"
Write-Output "    Rate:         $p1Rate docs/s"
Write-Output ""
Write-Output "  PHASE 2 - Attachments:"
Write-Output "    Uploaded:     $uploaded / $ATTACH_COUNT"
Write-Output "    Failed:       $uploadFailed"
Write-Output "    Rate:         $p2Rate attachments/s"
Write-Output ""
Write-Output "  PHASE 3 - Operations:"
Write-Output "    Searches:     $searchOk / 50"
Write-Output "    Dashboard:    $dashOk / 20"
Write-Output "    Notifications:$notifOk / 20"
Write-Output "    Pagination:   $pageOk / 10"
Write-Output "    Reports:      $rptOk / 3"
Write-Output ""
Write-Output "  PHASE 4 - Query Performance:"
if ($r1.Data) { Write-Output "    List 100:     $([Math]::Round($t1.Elapsed.TotalMilliseconds))ms" }
if ($r2.Data) { Write-Output "    Dashboard:    $([Math]::Round($t2.Elapsed.TotalMilliseconds))ms" }
if ($r3.Data) { Write-Output "    Deep offset:  $([Math]::Round($t3.Elapsed.TotalMilliseconds))ms" }
if ($r4.Data) { Write-Output "    Filter:       $([Math]::Round($t4.Elapsed.TotalMilliseconds))ms" }
Write-Output ""
Write-Output "  Total errors:   $($errors.Count)"
Write-Output "============================================"

if ($errors.Count -gt 0) {
    Write-Output ""
    Write-Output "First 10 errors:"
    $errors | Select-Object -First 10 | ForEach-Object { Write-Output "  - $_" }
}
