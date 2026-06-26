# NONECO DTS - Multi-User Routing + Attachment Stress Test
# Uses all accounts simultaneously to stress test the system
param(
  [int]$DOCS_PER_USER = 50,
  [int]$DELAY_MS = 30
)

$ErrorActionPreference = 'Continue'
$BASE = 'http://localhost:5000/api'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$global:rateLimitHits = 0
$global:rateLimitRetries = 0

function Log($msg) { Write-Output "[$(Get-Date -Format 'HH:mm:ss')] $msg" }

function Auth($user, $pass) {
    $body = "{`"username`":`"$user`",`"password`":`"$pass`"}"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $req = [System.Net.HttpWebRequest]::Create("$BASE/auth/login")
    $req.Method = 'POST'; $req.ContentType = 'application/json'; $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream(); $stream.Write($bytes, 0, $bytes.Length); $stream.Close()
    try {
        $resp = $req.GetResponse(); $sr = [System.IO.StreamReader]::new($resp.GetResponseStream())
        $data = ($sr.ReadToEnd() | ConvertFrom-Json); $sr.Close(); $resp.Close()
        return $data.token
    } catch { return $null }
}

function Post($url, $body, $token) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = 'POST'; $req.ContentType = 'application/json'; $req.ContentLength = $bytes.Length
    $req.Headers.Add("Authorization", "Bearer $token")
    $stream = $req.GetRequestStream(); $stream.Write($bytes, 0, $bytes.Length); $stream.Close()
    try {
        $resp = $req.GetResponse(); $sr = [System.IO.StreamReader]::new($resp.GetResponseStream())
        $data = $sr.ReadToEnd(); $sr.Close(); $resp.Close()
        return @{ Ok = $true; Data = ($data | ConvertFrom-Json); Status = [int]$resp.StatusCode }
    } catch {
        $e = $_.Exception.Response
        if ($e) {
            $sr = [System.IO.StreamReader]::new($e.GetResponseStream()); $d = $sr.ReadToEnd(); $sr.Close()
            $status = [int]$e.StatusCode; $e.Close()
            return @{ Ok = $false; Data = $d; Status = $status }
        }
        return @{ Ok = $false; Data = $_.Exception.Message; Status = 0 }
    }
}

function PostWithRetry($url, $body, $token, $maxRetries = 2) {
    $attempt = 0
    while ($attempt -le $maxRetries) {
        $r = Post $url $body $token
        if ($r.Ok) { return $r }
        if ($r.Status -eq 429) {
            $global:rateLimitHits++
            $wait = 5
            if ($attempt -lt $maxRetries) {
                Log "    [429] Rate limited, waiting ${wait}s (attempt $($attempt+1)/$($maxRetries+1))..."
                Start-Sleep -Seconds $wait
                $global:rateLimitRetries++
            }
            $attempt++
            continue
        }
        return $r
    }
    return $r
}

function Get($url, $token) {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = 'GET'; $req.Accept = 'application/json'
    $req.Headers.Add("Authorization", "Bearer $token")
    try {
        $resp = $req.GetResponse(); $sr = [System.IO.StreamReader]::new($resp.GetResponseStream())
        $data = ($sr.ReadToEnd() | ConvertFrom-Json); $sr.Close(); $resp.Close()
        return @{ Ok = $true; Data = $data }
    } catch {
        $e = $_.Exception.Response; if ($e) { $e.Close() }
        return @{ Ok = $false; Data = $null }
    }
}

function Upload($url, $filePath, $token) {
    $boundary = [System.Guid]::NewGuid().ToString()
    $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
    $fileName = [System.IO.Path]::GetFileName($filePath)
    $pre = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes("--$boundary`r`nContent-Disposition: form-data; name=`"file`"; filename=`"$fileName`"`r`nContent-Type: application/pdf`r`n`r`n")
    $post = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes("`r`n--$boundary--`r`n")
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = 'POST'; $req.ContentType = "multipart/form-data; boundary=$boundary"; $req.ContentLength = $pre.Length + $fileBytes.Length + $post.Length
    $req.Headers.Add("Authorization", "Bearer $token")
    $stream = $req.GetRequestStream(); $stream.Write($pre, 0, $pre.Length); $stream.Write($fileBytes, 0, $fileBytes.Length); $stream.Write($post, 0, $post.Length); $stream.Close()
    try { $resp = $req.GetResponse(); $resp.Close(); return $true } catch { $e = $_.Exception.Response; if ($e) { $e.Close() }; return $false }
}

function GetError($r) {
    if (!$r.Data) { return "HTTP $($r.Status)" }
    try { return ($r.Data | ConvertFrom-Json).error.code } catch { return "HTTP $($r.Status)" }
}

# ===== LOGIN ALL ACCOUNTS =====
$accounts = @(
    @{ user = 'admin';       pass = 'password';   role = 'admin' },
    @{ user = 'Pao';         pass = 'password';   role = 'staff' },
    @{ user = 'KimFSD';     pass = 'password';   role = 'staff' },
    @{ user = 'GraceCITET'; pass = 'password';   role = 'staff' },
    @{ user = 'GirlieIAD';  pass = 'password';   role = 'staff' },
    @{ user = 'Elmer';       pass = 'password';   role = 'staff' },
    @{ user = 'HeadISD';     pass = 'head12345';  role = 'dept_head' },
    @{ user = 'HeadFSD';     pass = 'head12345';  role = 'dept_head' }
)

Log "Logging in all accounts..."
$tokens = @{}
foreach ($a in $accounts) {
    $t = Auth $a.user $a.pass
    if ($t) { $tokens[$a.user] = $t; Log "  $($a.user) ($($a.role)) - OK" }
    else { Log "  $($a.user) - FAILED" }
}
Log "Logged in: $($tokens.Count)/$($accounts.Count)"

$adminToken = $tokens['admin']

$categories = (Get "$BASE/categories" $adminToken).Data
$depts = (Get "$BASE/departments" $adminToken).Data
Log "Categories: $($categories.Count) | Departments: $($depts.Count)"

# Create test PDF
$pdfDir = "$PSScriptRoot\test-pdfs"
if (!(Test-Path $pdfDir)) { New-Item -ItemType Directory -Path $pdfDir -Force | Out-Null }
$pdfBytes = [byte[]](0x25,0x50,0x44,0x46,0x2D,0x31,0x2E,0x34,0x0A)
$pdfBytes += [byte[]](0x25,0xE2,0xE3,0xCF,0xD3,0x0A)
$pdfBytes += [byte[]](0x31,0x20,0x30,0x20,0x6F,0x62,0x6A,0x65,0x63,0x74,0x0A,0x3C,0x3C,0x2F,0x54,0x79,0x70,0x65,0x2F,0x43,0x61,0x74,0x61,0x6C,0x6F,0x67,0x2F,0x50,0x61,0x67,0x65,0x73,0x20,0x32,0x20,0x30,0x20,0x52,0x3E,0x3E,0x0A,0x65,0x6E,0x64,0x6F,0x62,0x6A,0x0A)
$pdfBytes += [byte[]](0x32,0x20,0x30,0x20,0x6F,0x62,0x6A,0x65,0x63,0x74,0x0A,0x3C,0x3C,0x2F,0x54,0x79,0x70,0x65,0x2F,0x50,0x61,0x67,0x65,0x73,0x2F,0x4B,0x69,0x64,0x73,0x5B,0x33,0x20,0x30,0x20,0x52,0x5D,0x2F,0x43,0x6F,0x75,0x6E,0x74,0x20,0x31,0x3E,0x3E,0x0A,0x65,0x6E,0x64,0x6F,0x62,0x6A,0x0A)
$pdfBytes += [byte[]](0x33,0x20,0x30,0x20,0x6F,0x62,0x6A,0x65,0x63,0x74,0x0A,0x3C,0x3C,0x2F,0x54,0x79,0x70,0x65,0x2F,0x50,0x61,0x67,0x65,0x2F,0x50,0x61,0x72,0x65,0x6E,0x74,0x20,0x32,0x20,0x30,0x20,0x52,0x2F,0x4D,0x65,0x64,0x69,0x61,0x42,0x6F,0x78,0x5B,0x30,0x20,0x30,0x20,0x36,0x31,0x32,0x20,0x37,0x39,0x32,0x5D,0x3E,0x3E,0x0A,0x65,0x6E,0x64,0x6F,0x62,0x6A,0x0A)
$pdfBytes += [byte[]](0x78,0x72,0x65,0x66,0x0A,0x30,0x20,0x34,0x0A,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x20,0x20,0x20,0x20,0x30,0x20,0x66,0x0A)
$pdfBytes += [byte[]](0x74,0x72,0x61,0x69,0x6C,0x65,0x72,0x0A,0x3C,0x3C,0x2F,0x53,0x69,0x7A,0x65,0x20,0x34,0x2F,0x52,0x6F,0x6F,0x74,0x20,0x31,0x20,0x30,0x20,0x52,0x3E,0x3E,0x0A)
$pdfBytes += [byte[]](0x73,0x74,0x61,0x72,0x74,0x78,0x72,0x65,0x66,0x0A,0x30,0x0A,0x25,0x25,0x45,0x4F,0x46)
$pdfPath = "$pdfDir\test.pdf"
[System.IO.File]::WriteAllBytes($pdfPath, $pdfBytes)

# ===== PHASE 1: EACH USER CREATES DOCUMENTS =====
$TOTAL_NEW = $DOCS_PER_USER * $tokens.Count
Log "=== PHASE 1: Each user creates $DOCS_PER_USER docs ($TOTAL_NEW total) ==="
$p1sw = [System.Diagnostics.Stopwatch]::StartNew()

$allNewDocIds = [System.Collections.ArrayList]::new()
$createSuccess = 0; $createFailed = 0
$createErrors = @{}

foreach ($a in $accounts) {
    if (!$tokens.ContainsKey($a.user)) { continue }
    $tk = $tokens[$a.user]
    $myDept = $depts | Where-Object { $_.code -ne 'AOD' } | Select-Object -First 1
    if (!$myDept) { $myDept = $depts | Select-Object -First 1 }
    $myCat = $categories | Where-Object { $_.name -eq 'Memo' } | Select-Object -First 1
    if (!$myCat) { $myCat = $categories | Select-Object -First 1 }
    $userSuccess = 0
    for ($i = 0; $i -lt $DOCS_PER_USER; $i++) {
        $body = @{ title = "$($a.user) Stress #$($i+1)"; category_id = $myCat.id; originating_department_id = $myDept.id; priority = @('normal','high','urgent')[$i % 3]; description = "Stress test by $($a.user)" } | ConvertTo-Json
        $r = PostWithRetry "$BASE/documents" $body $tk
        if ($r.Ok) { $createSuccess++; $userSuccess++; [void]$allNewDocIds.Add(@{ Id = $r.Data.id; User = $a.user }) }
        else {
            $createFailed++
            $errCode = GetError $r
            if (!$createErrors.ContainsKey($errCode)) { $createErrors[$errCode] = 0 }
            $createErrors[$errCode]++
            if ($createFailed -le 10) { Log "    FAIL [$($r.Status)] $errCode - $($a.user) doc #$($i+1)" }
        }
        if ($DELAY_MS -gt 0) { Start-Sleep -Milliseconds $DELAY_MS }
    }
    Log "  $($a.user): $userSuccess / $DOCS_PER_USER created"
}
$p1Time = $p1sw.Elapsed.TotalSeconds
$p1Rate = [Math]::Round($createSuccess/$p1Time,1)
$p1TimeR = [Math]::Round($p1Time,1)
Log "Phase 1 DONE: $createSuccess created, $createFailed failed in ${p1TimeR}s (${p1Rate} per sec)"
if ($createErrors.Count -gt 0) { $errParts = @(); foreach ($k in $createErrors.Keys) { $errParts += "${k}:$($createErrors[$k])" }; Log "  Error breakdown: $($errParts -join ', ')" }
Log "  Rate limit hits: $global:rateLimitHits | Retries: $global:rateLimitRetries"

# ===== PHASE 2: FORWARD TO EACH OTHER (CROSS-DEPT) =====
Log "=== PHASE 2: Cross-department forwarding ==="
$p2sw = [System.Diagnostics.Stopwatch]::StartNew()

$fwdSuccess = 0; $fwdFailed = 0
$fwdErrors = @{}
$userDeptMap = @{
    'Pao'         = $depts | Where-Object { $_.code -eq 'ISD' }
    'KimFSD'     = $depts | Where-Object { $_.code -eq 'FSD' }
    'GraceCITET' = $depts | Where-Object { $_.code -eq 'CITET' }
    'GirlieIAD'  = $depts | Where-Object { $_.code -eq 'IAD' }
    'Elmer'       = $depts | Where-Object { $_.code -eq 'ISD' }
    'HeadISD'     = $depts | Where-Object { $_.code -eq 'ISD' }
    'HeadFSD'     = $depts | Where-Object { $_.code -eq 'FSD' }
    'admin'       = $depts | Where-Object { $_.code -eq 'OGM' }
}

$otherDepts = $depts | Where-Object { $_.code -ne 'AOD' }

$idx = 0
foreach ($entry in $allNewDocIds) {
    $creatorDept = $userDeptMap[$entry.User]
    $target = $otherDepts | Where-Object { $_.id -ne $creatorDept.id } | Select-Object -First 1
    if (!$target) { $target = $otherDepts | Select-Object -First 1 }

    $body = @{ to_department_id = $target.id; routing_note = "Stress cross-dept: $($entry.User) -> $($target.code)" } | ConvertTo-Json
    $r = PostWithRetry "$BASE/documents/$($entry.Id)/forward" $body $adminToken
    if ($r.Ok) { $fwdSuccess++ } else {
        $fwdFailed++
        $errCode = GetError $r
        if (!$fwdErrors.ContainsKey($errCode)) { $fwdErrors[$errCode] = 0 }
        $fwdErrors[$errCode]++
        if ($fwdFailed -le 5) { Log "    FORWARD FAIL [$($r.Status)] $errCode - doc $($entry.Id)" }
    }
    $idx++

    if ($idx % 50 -eq 0 -or $idx -eq $allNewDocIds.Count) {
        $rate = if ($p2sw.Elapsed.TotalSeconds -gt 0) { [Math]::Round($idx / $p2sw.Elapsed.TotalSeconds, 1) } else { 0 }
        Log "  Forwarded $idx/$($allNewDocIds.Count) - ${rate}/sec - $fwdFailed failed"
    }
    if ($DELAY_MS -gt 0) { Start-Sleep -Milliseconds $DELAY_MS }
}
$p2Time = $p2sw.Elapsed.TotalSeconds
$p2Rate = [Math]::Round($fwdSuccess/$p2Time,1)
$p2TimeR = [Math]::Round($p2Time,1)
Log "Phase 2 DONE: $fwdSuccess forwarded, $fwdFailed failed in ${p2TimeR}s (${p2Rate} per sec)"
if ($fwdErrors.Count -gt 0) { $errParts = @(); foreach ($k in $fwdErrors.Keys) { $errParts += "${k}:$($fwdErrors[$k])" }; Log "  Error breakdown: $($errParts -join ', ')" }

# ===== PHASE 3: RETURN ALL (RECALL) =====
Log "=== PHASE 3: Recall all forwarded docs ==="
$p3sw = [System.Diagnostics.Stopwatch]::StartNew()

$retSuccess = 0; $retFailed = 0
$retErrors = @{}
$idx = 0
foreach ($entry in $allNewDocIds) {
    $body = @{ reason = "Stress test recall by $($entry.User)" } | ConvertTo-Json
    $r = PostWithRetry "$BASE/documents/$($entry.Id)/recall" $body $adminToken
    if ($r.Ok) { $retSuccess++ } else {
        $retFailed++
        $errCode = GetError $r
        if (!$retErrors.ContainsKey($errCode)) { $retErrors[$errCode] = 0 }
        $retErrors[$errCode]++
        if ($retFailed -le 5) { Log "    RECALL FAIL [$($r.Status)] $errCode - doc $($entry.Id)" }
    }
    $idx++

    if ($idx % 50 -eq 0 -or $idx -eq $allNewDocIds.Count) {
        $rate = if ($p3sw.Elapsed.TotalSeconds -gt 0) { [Math]::Round($idx / $p3sw.Elapsed.TotalSeconds, 1) } else { 0 }
        Log "  Returned $idx/$($allNewDocIds.Count) - ${rate}/sec - $retFailed failed"
    }
    if ($DELAY_MS -gt 0) { Start-Sleep -Milliseconds $DELAY_MS }
}
$p3Time = $p3sw.Elapsed.TotalSeconds
$p3Rate = [Math]::Round($retSuccess/$p3Time,1)
$p3TimeR = [Math]::Round($p3Time,1)
Log "Phase 3 DONE: $retSuccess returned, $retFailed failed in ${p3TimeR}s (${p3Rate} per sec)"
if ($retErrors.Count -gt 0) { $errParts = @(); foreach ($k in $retErrors.Keys) { $errParts += "${k}:$($retErrors[$k])" }; Log "  Error breakdown: $($errParts -join ', ')" }

# ===== PHASE 4: ATTACHMENT STRESS TEST =====
Log "=== PHASE 4: Attachment upload stress (every user uploads to their docs) ==="
$p4sw = [System.Diagnostics.Stopwatch]::StartNew()

$uploadSuccess = 0; $uploadFailed = 0
$idx = 0

foreach ($a in $accounts) {
    if (!$tokens.ContainsKey($a.user)) { continue }
    $tk = $tokens[$a.user]
    $myDocs = $allNewDocIds | Where-Object { $_.User -eq $a.user }

    foreach ($entry in $myDocs) {
        $ok = Upload "$BASE/documents/$($entry.Id)/attachments" $pdfPath $tk
        if ($ok) { $uploadSuccess++ } else { $uploadFailed++ }
        $idx++

        if ($idx % 50 -eq 0) {
            $rate = if ($p4sw.Elapsed.TotalSeconds -gt 0) { [Math]::Round($idx / $p4sw.Elapsed.TotalSeconds, 1) } else { 0 }
            Log "  Uploaded $idx - ${rate}/sec - $uploadFailed failed"
        }
        if ($DELAY_MS -gt 0) { Start-Sleep -Milliseconds $DELAY_MS }
    }
}
$p4Time = $p4sw.Elapsed.TotalSeconds
$p4Rate = [Math]::Round($uploadSuccess/$p4Time,1)
$p4TimeR = [Math]::Round($p4Time,1)
Log "Phase 4 DONE: $uploadSuccess uploaded, $uploadFailed failed in ${p4TimeR}s (${p4Rate} per sec)"

# ===== PHASE 5: RE-FORWARD WITH ATTACHMENTS =====
Log "=== PHASE 5: Re-forward docs with attachments ==="
$p5sw = [System.Diagnostics.Stopwatch]::StartNew()

$r2Fwd = 0; $r2Fail = 0; $r2Errors = @{}; $idx = 0
foreach ($entry in $allNewDocIds) {
    $target = $otherDepts | Select-Object -Skip ($idx % ($otherDepts.Count - 1)) -First 1
    $body = @{ to_department_id = $target.id; routing_note = "Stress re-forward with attachments" } | ConvertTo-Json
    $r = PostWithRetry "$BASE/documents/$($entry.Id)/forward" $body $adminToken
    if ($r.Ok) { $r2Fwd++ } else {
        $r2Fail++
        $errCode = GetError $r
        if (!$r2Errors.ContainsKey($errCode)) { $r2Errors[$errCode] = 0 }
        $r2Errors[$errCode]++
        if ($r2Fail -le 5) { Log "    RE-FWD FAIL [$($r.Status)] $errCode - doc $($entry.Id)" }
    }
    $idx++
    if ($idx % 50 -eq 0 -or $idx -eq $allNewDocIds.Count) {
        $rate = if ($p5sw.Elapsed.TotalSeconds -gt 0) { [Math]::Round($idx / $p5sw.Elapsed.TotalSeconds, 1) } else { 0 }
        Log "  Re-forwarded $idx/$($allNewDocIds.Count) - ${rate}/sec"
    }
    if ($DELAY_MS -gt 0) { Start-Sleep -Milliseconds $DELAY_MS }
}
$p5Time = $p5sw.Elapsed.TotalSeconds
$p5TimeR = [Math]::Round($p5Time,1)
Log "Phase 5 DONE: $r2Fwd re-forwarded, $r2Fail failed in ${p5TimeR}s"
if ($r2Errors.Count -gt 0) { $errParts = @(); foreach ($k in $r2Errors.Keys) { $errParts += "${k}:$($r2Errors[$k])" }; Log "  Error breakdown: $($errParts -join ', ')" }

# ===== PHASE 6: VERIFY UNDER LOAD =====
Log "=== Phase 6: Verify system under load ==="

$t1 = [System.Diagnostics.Stopwatch]::StartNew()
$r1 = Get "$BASE/documents?limit=100" $adminToken
$t1.Stop()
$t1ms = [Math]::Round($t1.Elapsed.TotalMilliseconds)
Log "  List 100: ${t1ms}ms (total: $($r1.Data.total))"

$t2 = [System.Diagnostics.Stopwatch]::StartNew()
$r2 = Get "$BASE/dashboard" $adminToken
$t2.Stop()
$t2ms = [Math]::Round($t2.Elapsed.TotalMilliseconds)
Log "  Dashboard: ${t2ms}ms"

$t3 = [System.Diagnostics.Stopwatch]::StartNew()
$r3 = Get "$BASE/documents/quick-search?q=Stress" $adminToken
$t3.Stop()
$t3ms = [Math]::Round($t3.Elapsed.TotalMilliseconds)
Log "  Search 'Stress': ${t3ms}ms"

# Check disk usage
$uploadSize = 0
if (Test-Path "$PSScriptRoot\uploads") {
    $uploadSize = (Get-ChildItem "$PSScriptRoot\uploads" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
}
$uploadSizeMB = [Math]::Round($uploadSize / 1MB, 2)
Log "  Upload disk usage: ${uploadSizeMB} MB"

# ===== FINAL REPORT =====
$sw.Stop()
$totalMin = [Math]::Round($sw.Elapsed.TotalMinutes, 1)
$totalSec = [Math]::Round($sw.Elapsed.TotalSeconds, 1)

Write-Output ""
Write-Output "============================================"
Write-Output "  MULTI-USER STRESS TEST RESULTS"
Write-Output "============================================"
Write-Output "  Total time:       ${totalMin}m (${totalSec}s)"
Write-Output ""
Write-Output "  PHASE 1 - Create ($($tokens.Count) users x $DOCS_PER_USER):"
Write-Output "    Created:        $createSuccess / $TOTAL_NEW"
Write-Output "    Failed:         $createFailed"
Write-Output "    Rate:           ${p1Rate} per sec"
Write-Output ""
Write-Output "  PHASE 2 - Forward (cross-dept):"
Write-Output "    Forwarded:      $fwdSuccess / $($allNewDocIds.Count)"
Write-Output "    Failed:         $fwdFailed"
Write-Output "    Rate:           ${p2Rate} per sec"
Write-Output ""
Write-Output "  PHASE 3 - Recall:"
Write-Output "    Returned:       $retSuccess / $($allNewDocIds.Count)"
Write-Output "    Failed:         $retFailed"
Write-Output "    Rate:           ${p3Rate} per sec"
Write-Output ""
Write-Output "  PHASE 4 - Attachments:"
Write-Output "    Uploaded:       $uploadSuccess / $($allNewDocIds.Count)"
Write-Output "    Failed:         $uploadFailed"
Write-Output "    Rate:           ${p4Rate} per sec"
Write-Output ""
Write-Output "  PHASE 5 - Re-forward:"
Write-Output "    Re-forwarded:   $r2Fwd / $($allNewDocIds.Count)"
Write-Output "    Failed:         $r2Fail"
Write-Output ""
Write-Output "  Disk usage:       ${uploadSizeMB} MB"
Write-Output ""
Write-Output "  Rate limit hits:  $global:rateLimitHits"
Write-Output "  Rate limit retries: $global:rateLimitRetries"
Write-Output "============================================"
