# NONECO DTS — Routing Stress Test
# Forward all load test docs to other departments, then return them
param(
  [int]$BATCH_SIZE = 10
)

$ErrorActionPreference = 'Continue'
$BASE = 'http://localhost:5000/api'
$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Log($msg) { Write-Output "[$(Get-Date -Format 'HH:mm:ss')] $msg" }

function Invoke-JsonPost($url, $body, $token) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = 'POST'; $req.ContentType = 'application/json'; $req.ContentLength = $bytes.Length
    if ($token) { $req.Headers.Add("Authorization", "Bearer $token") }
    $stream = $req.GetRequestStream(); $stream.Write($bytes, 0, $bytes.Length); $stream.Close()
    try {
        $resp = $req.GetResponse(); $reader = [System.IO.StreamReader]::new($resp.GetResponseStream())
        $data = $reader.ReadToEnd(); $reader.Close(); $resp.Close()
        return @{ Ok = $true; Data = ($data | ConvertFrom-Json); Status = 200 }
    } catch {
        $e = $_.Exception.Response
        if ($e) { $sr = [System.IO.StreamReader]::new($e.GetResponseStream()); $errData = $sr.ReadToEnd(); $sr.Close(); $e.Close(); return @{ Ok = $false; Data = $errData; Status = [int]$e.StatusCode } }
        return @{ Ok = $false; Data = $_.Exception.Message; Status = 0 }
    }
}

function Invoke-JsonGet($url, $token) {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = 'GET'; $req.Accept = 'application/json'
    if ($token) { $req.Headers.Add("Authorization", "Bearer $token") }
    try {
        $resp = $req.GetResponse(); $reader = [System.IO.StreamReader]::new($resp.GetResponseStream())
        $data = $reader.ReadToEnd(); $reader.Close(); $resp.Close()
        return @{ Ok = $true; Data = ($data | ConvertFrom-Json); Status = 200 }
    } catch {
        $e = $_.Exception.Response
        if ($e) { $e.Close(); return @{ Ok = $false; Data = $null; Status = [int]$e.StatusCode } }
        return @{ Ok = $false; Data = $null; Status = 0 }
    }
}

# ===== SETUP =====
Log "Logging in as admin..."
$login = Invoke-JsonPost "$BASE/auth/login" '{"username":"admin","password":"password"}' $null
$TOKEN = $login.Data.token
Log "Token OK"

$deptRes = Invoke-JsonGet "$BASE/departments" $TOKEN
$allDepts = $deptRes.Data
# Exclude AOD (originating dept for load test docs) — route to other depts
$targetDepts = $allDepts | Where-Object { $_.code -ne 'AOD' }
Log "Target departments for routing: $($targetDepts | ForEach-Object { $_.code })"

# ===== COLLECT ALL LOAD TEST DOCUMENTS =====
Log "Collecting all Load Test documents..."
$allDocs = @()
$page = 1
do {
    $r = Invoke-JsonGet "$BASE/documents?limit=100&page=$page" $TOKEN
    if ($r.Ok -and $r.Data.data.Count -gt 0) {
        $loadDocs = $r.Data.data | Where-Object { $_.title -like 'Load Test*' }
        $allDocs += $loadDocs
        $page++
    } else { break }
} while ($r.Data.data.Count -eq 100)

Log "Found $($allDocs.Count) load test documents"

# Count by status
$statusGroups = $allDocs | Group-Object -Property status
$statusGroups | ForEach-Object { Log "  $($_.Name): $($_.Count)" }

$pendingDocs = $allDocs | Where-Object { $_.status -eq 'pending' -and $_.current_department.code -eq 'AOD' }
Log "Eligible for forwarding (pending in AOD): $($pendingDocs.Count)"

# ===== PHASE 1: FORWARD ALL TO OTHER DEPARTMENTS =====
Log "=== PHASE 1: Forwarding $($pendingDocs.Count) docs to other departments ==="
$p1sw = [System.Diagnostics.Stopwatch]::StartNew()

$fwdSuccess = 0; $fwdFailed = 0; $fwdErrors = @()

for ($i = 0; $i -lt $pendingDocs.Count; $i++) {
    $doc = $pendingDocs[$i]
    $targetDept = $targetDepts[$i % $targetDepts.Count]
    
    $body = @{ to_department_id = $targetDept.id; routing_note = "Stress test: forwarding doc #$($i+1) to $($targetDept.code)" } | ConvertTo-Json
    $r = Invoke-JsonPost "$BASE/documents/$($doc.id)/forward" $body $TOKEN
    
    if ($r.Ok) { $fwdSuccess++ } else { $fwdFailed++; $fwdErrors += "$($doc.tracking_number) -> $($targetDept.code): $($r.Status) $($r.Data)" }
    
    if (($i + 1) % 25 -eq 0 -or $i -eq $pendingDocs.Count - 1) {
        $elapsed = $p1sw.Elapsed.TotalSeconds
        $rate = if ($elapsed -gt 0) { [Math]::Round(($i+1) / $elapsed, 1) } else { 0 }
        Log "  Forwarded $($i+1)/$($pendingDocs.Count) - $rate/s - $($fwdFailed) failed"
    }
}

$p1Time = $p1sw.Elapsed.TotalSeconds
$p1Rate = if ($p1Time -gt 0) { [Math]::Round($fwdSuccess / $p1Time, 1) } else { 0 }
Log "Phase 1 DONE: $fwdSuccess forwarded, $fwdFailed failed in $([Math]::Round($p1Time,1))s ($p1Rate/s)"

# ===== PHASE 2: RETURN ALL BACK TO AOD =====
Log "=== PHASE 2: Returning all forwarded docs back to AOD ==="
$p2sw = [System.Diagnostics.Stopwatch]::StartNew()

# Re-collect forwarded docs
$fwdDocs = @()
$page = 1
do {
    $r = Invoke-JsonGet "$BASE/documents?limit=100&page=$page" $TOKEN
    if ($r.Ok -and $r.Data.data.Count -gt 0) {
        $fwdDocs += ($r.Data.data | Where-Object { $_.title -like 'Load Test*' -and $_.status -eq 'forwarded' })
        $page++
    } else { break }
} while ($r.Data.data.Count -eq 100)

Log "Found $($fwdDocs.Count) forwarded docs to return"

$retSuccess = 0; $retFailed = 0; $retErrors = @()

for ($i = 0; $i -lt $fwdDocs.Count; $i++) {
    $doc = $fwdDocs[$i]
    
    $body = @{ reason = "Stress test: returning doc #$($i+1)" } | ConvertTo-Json
    $r = Invoke-JsonPost "$BASE/documents/$($doc.id)/recall" $body $TOKEN
    
    if ($r.Ok) { $retSuccess++ } else { $retFailed++; $retErrors += "$($doc.tracking_number): $($r.Status) $($r.Data)" }
    
    if (($i + 1) % 25 -eq 0 -or $i -eq $fwdDocs.Count - 1) {
        $elapsed = $p2sw.Elapsed.TotalSeconds
        $rate = if ($elapsed -gt 0) { [Math]::Round(($i+1) / $elapsed, 1) } else { 0 }
        Log "  Returned $($i+1)/$($fwdDocs.Count) - $rate/s - $($retFailed) failed"
    }
}

$p2Time = $p2sw.Elapsed.TotalSeconds
$p2Rate = if ($p2Time -gt 0) { [Math]::Round($retSuccess / $p2Time, 1) } else { 0 }
Log "Phase 2 DONE: $retSuccess returned, $retFailed failed in $([Math]::Round($p2Time,1))s ($p2Rate/s)"

# ===== PHASE 3: RE-FORWARD TO TEST ROUND-ROBIN =====
Log "=== PHASE 3: Re-forwarding returned docs (round 2) ==="
$p3sw = [System.Diagnostics.Stopwatch]::StartNew()

# Re-collect returned docs (pending in AOD again)
$retDocs = @()
$page = 1
do {
    $r = Invoke-JsonGet "$BASE/documents?limit=100&page=$page" $TOKEN
    if ($r.Ok -and $r.Data.data.Count -gt 0) {
        $retDocs += ($r.Data.data | Where-Object { $_.title -like 'Load Test*' -and $_.status -eq 'returned' })
        $page++
    } else { break }
} while ($r.Data.data.Count -eq 100)

Log "Found $($retDocs.Count) returned docs for re-forwarding"

$r2Fwd = 0; $r2Fail = 0
for ($i = 0; $i -lt $retDocs.Count; $i++) {
    $doc = $retDocs[$i]
    $targetDept = $targetDepts[($i + 1) % $targetDepts.Count]  # offset to different dept
    $body = @{ to_department_id = $targetDept.id; routing_note = "Stress test round 2: $($targetDept.code)" } | ConvertTo-Json
    $r = Invoke-JsonPost "$BASE/documents/$($doc.id)/forward" $body $TOKEN
    if ($r.Ok) { $r2Fwd++ } else { $r2Fail++ }
    
    if (($i + 1) % 25 -eq 0 -or $i -eq $retDocs.Count - 1) {
        $elapsed = $p3sw.Elapsed.TotalSeconds
        $rate = if ($elapsed -gt 0) { [Math]::Round(($i+1) / $elapsed, 1) } else { 0 }
        Log "  Re-forwarded $($i+1)/$($retDocs.Count) - $rate/s"
    }
}
$p3Time = $p3sw.Elapsed.TotalSeconds
Log "Phase 3 DONE: $r2Fwd re-forwarded, $r2Fail failed in $([Math]::Round($p3Time,1))s"

# ===== PHASE 4: VERIFY + PERFORMANCE UNDER LOAD =====
Log "=== Phase 4: Verify + Performance ==="
$t1 = [System.Diagnostics.Stopwatch]::StartNew()
$r1 = Invoke-JsonGet "$BASE/documents?limit=100" $TOKEN
$t1.Stop()
Log "  List 100 docs: $([Math]::Round($t1.Elapsed.TotalMilliseconds))ms (total: $($r1.Data.total))"

$t2 = [System.Diagnostics.Stopwatch]::StartNew()
$r2 = Invoke-JsonGet "$BASE/dashboard" $TOKEN
$t2.Stop()
Log "  Dashboard: $([Math]::Round($t2.Elapsed.TotalMilliseconds))ms (counts: $($r2.Data.counts.total))"

$t3 = [System.Diagnostics.Stopwatch]::StartNew()
$r3 = Invoke-JsonGet "$BASE/documents/quick-search?q=Load+Test" $TOKEN
$t3.Stop()
Log "  Quick search 'Load Test': $([Math]::Round($t3.Elapsed.TotalMilliseconds))ms"

# ===== FINAL REPORT =====
$sw.Stop()
$totalMin = [Math]::Round($sw.Elapsed.TotalMinutes, 1)
$totalSec = [Math]::Round($sw.Elapsed.TotalSeconds, 1)

Write-Output ""
Write-Output "============================================"
Write-Output "  ROUTING STRESS TEST RESULTS"
Write-Output "============================================"
Write-Output "  Total time:     ${totalMin}m (${totalSec}s)"
Write-Output ""
Write-Output "  PHASE 1 - Forward:"
Write-Output "    Forwarded:    $fwdSuccess / $($pendingDocs.Count)"
Write-Output "    Failed:       $fwdFailed"
Write-Output "    Rate:         $p1Rate/s"
Write-Output ""
Write-Output "  PHASE 2 - Return (recall):"
Write-Output "    Returned:     $retSuccess / $($fwdDocs.Count)"
Write-Output "    Failed:       $retFailed"
Write-Output "    Rate:         $p2Rate/s"
Write-Output ""
Write-Output "  PHASE 3 - Re-forward:"
Write-Output "    Re-forwarded: $r2Fwd / $($retDocs.Count)"
Write-Output "    Failed:       $r2Fail"
Write-Output ""
Write-Output "  Total errors:   $($fwdErrors.Count + $retErrors.Count)"
Write-Output "============================================"

if ($fwdErrors.Count -gt 0) {
    Write-Output ""
    Write-Output "Forward errors (first 5):"
    $fwdErrors | Select-Object -First 5 | ForEach-Object { Write-Output "  - $_" }
}
if ($retErrors.Count -gt 0) {
    Write-Output ""
    Write-Output "Return errors (first 5):"
    $retErrors | Select-Object -First 5 | ForEach-Object { Write-Output "  - $_" }
}
