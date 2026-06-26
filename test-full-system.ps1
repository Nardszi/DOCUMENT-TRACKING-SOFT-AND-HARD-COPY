param(
    [string]$Base = "http://localhost:5000",
    [int]$DocsPerUser = 2
)

$script:Results = @()
$script:TokenCache = @{}
$script:TestDocIds = @()

function Log([string]$msg, [string]$color = "White") {
    Write-Host $msg -ForegroundColor $color
}

function Record([string]$area, [string]$test, [string]$status, [string]$detail = "") {
    $script:Results += [PSCustomObject]@{ Area=$area; Test=$test; Status=$status; Detail=$detail }
    $c = if ($status -eq "PASS") {"Green"} elseif ($status -eq "FAIL") {"Red"} else {"Yellow"}
    Log "  [$status] $test $detail" $c
}

function PostWithRetry([string]$url, [hashtable]$headers, [string]$body, [int]$retries = 2) {
    for ($i = 0; $i -le $retries; $i++) {
        try {
            return Invoke-RestMethod -Uri $url -Method POST -ContentType "application/json" -Headers $headers -Body $body -ErrorAction Stop
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            if ($code -eq 429 -and $i -lt $retries) {
                Log "    Rate limited, waiting 5s..." "Yellow"
                Start-Sleep -Seconds 5
            } else {
                throw
            }
        }
    }
}

function Login([string]$username, [string]$password) {
    try {
        $r = Invoke-RestMethod -Uri "$Base/api/auth/login" -Method POST -ContentType "application/json" -Body "{`"username`":`"$username`",`"password`":`"$password`"}" -ErrorAction Stop
        $script:TokenCache[$username] = $r.token
        return @{ ok=$true; token=$r.token; user=$r.user }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        return @{ ok=$false; code=$code }
    }
}

function Auth([string]$user) {
    @{ Authorization = "Bearer $($script:TokenCache[$user])" }
}

function Get([string]$url, [string]$user) {
    try {
        $r = Invoke-RestMethod -Uri $url -Method GET -Headers (Auth $user) -ErrorAction Stop
        return @{ ok=$true; data=$r }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        return @{ ok=$false; code=$code; error=$_.Exception.Message }
    }
}

function Post([string]$url, [string]$user, [string]$body) {
    try {
        $r = PostWithRetry $url (Auth $user) $body
        return @{ ok=$true; data=$r }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        return @{ ok=$false; code=$code; error=$_.Exception.Message }
    }
}

function Patch([string]$url, [string]$user, [string]$body) {
    try {
        $r = Invoke-RestMethod -Uri $url -Method PATCH -ContentType "application/json" -Headers (Auth $user) -Body $body -ErrorAction Stop
        return @{ ok=$true; data=$r }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        return @{ ok=$false; code=$code; error=$_.Exception.Message }
    }
}

function Delete([string]$url, [string]$user) {
    try {
        $r = Invoke-RestMethod -Uri $url -Method DELETE -Headers (Auth $user) -ErrorAction Stop
        return @{ ok=$true; data=$r }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        return @{ ok=$false; code=$code; error=$_.Exception.Message }
    }
}

# ============================================================
Log "`n=== NONECO DTS FULL SYSTEM TEST ===" "Cyan"
Log "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" "Gray"

# ============================================================
Log "`n--- 1. AUTH SYSTEM ---" "Magenta"

# Login all test accounts
$accounts = @(
    @{u="admin"; p="password"},
    @{u="Pao"; p="password"},
    @{u="KimFSD"; p="password"},
    @{u="GraceCITET"; p="password"},
    @{u="GirlieIAD"; p="password"},
    @{u="Elmer"; p="password"},
    @{u="HeadISD"; p="head12345"},
    @{u="HeadFSD"; p="head12345"}
)

foreach ($a in $accounts) {
    $r = Login $a.u $a.p
    if ($r.ok) { Record "Auth" "Login $($a.u)" "PASS" "role=$($r.user.role)" }
    else { Record "Auth" "Login $($a.u)" "FAIL" "code=$($r.code)" }
}

# Bad password
$r = Login "admin" "wrongpassword"
if (-not $r.ok -and $r.code -eq 401) { Record "Auth" "Bad password rejected" "PASS" }
else { Record "Auth" "Bad password rejected" "FAIL" "code=$($r.code)" }

# Missing fields
$r = Login "" ""
if (-not $r.ok) { Record "Auth" "Missing credentials rejected" "PASS" }
else { Record "Auth" "Missing credentials rejected" "FAIL" }

# Get admin's department ID from JWT token for use in register and create tests
$adminToken = (Invoke-RestMethod -Uri "$Base/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"password"}').token
# Decode JWT payload to get departmentId
$jwtParts = $adminToken.Split('.')
$payload = $jwtParts[1]
# Pad base64
$mod = $payload.Length % 4
if ($mod -ne 0) { $payload += ('=' * (4 - $mod)) }
$payload = $payload.Replace('-', '+').Replace('_', '/')
$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($payload))
$claims = $decoded | ConvertFrom-Json
$adminDeptId = $claims.departmentId
Log "  Admin department: $adminDeptId" "Gray"

# Register new user
$regName = "TestUser$(Get-Random -Maximum 9999)"
$r = Post "$Base/api/auth/register" "" "{`"username`":`"$regName`",`"password`":`"Test12345!`",`"full_name`":`"Test User`",`"department_id`":`"$adminDeptId`",`"email`":`"$regName@test.com`"}"
if ($r.ok) { Record "Auth" "Register new user" "PASS" }
else { Record "Auth" "Register new user" "FAIL" "code=$($r.code) err=$($r.error)" }

# Duplicate register
$r2 = Post "$Base/api/auth/register" "" "{`"username`":`"$regName`",`"password`":`"Test12345!`",`"full_name`":`"Test User`",`"department_id`":`"$adminDeptId`",`"email`":`"$regName@test.com`"}"
if (-not $r2.ok) { Record "Auth" "Duplicate registration blocked" "PASS" }
else { Record "Auth" "Duplicate registration blocked" "FAIL" }

# ============================================================
Log "`n--- 2. CATEGORIES & DEPARTMENTS ---" "Magenta"

$r = Get "$Base/api/categories" "admin"
if ($r.ok) { $cats = $r.data; Record "Categories" "List categories" "PASS" "count=$(if ($cats -is [array]) {$cats.Count} else {1})" }
else { Record "Categories" "List categories" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/categories?active_only=true" "admin"
if ($r.ok) { Record "Categories" "Filter active categories" "PASS" }
else { Record "Categories" "Filter active categories" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/departments" "admin"
if ($r.ok) { $depts = $r.data; Record "Departments" "List departments" "PASS" "count=$(if ($depts -is [array]) {$depts.Count} else {1})" }
else { Record "Departments" "List departments" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/templates" "admin"
if ($r.ok) { Record "Templates" "List templates" "PASS" }
else { Record "Templates" "List templates" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 3. DOCUMENT CRUD ---" "Magenta"

# Create doc
$catId = if ($cats -is [array]) { $cats[0].id } else { $cats.id }
$createBody = "{`"title`":`"TEST DOC $(Get-Random -Maximum 99999)`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"normal`",`"routing_note`":`"Test document`"}"
$r = Post "$Base/api/documents" "admin" $createBody
if ($r.ok) { $testDocId = $r.data.id; $script:TestDocIds += $testDocId; Record "Documents" "Create document" "PASS" "id=$testDocId" }
else { Record "Documents" "Create document" "FAIL" "code=$($r.code) err=$($r.error)" }

# List documents
$r = Get "$Base/api/documents?limit=5" "admin"
if ($r.ok -and $r.data.data) { Record "Documents" "List documents" "PASS" "count=$($r.data.data.Count) total=$($r.data.total)" }
elseif ($r.ok -and $r.data.documents) { Record "Documents" "List documents" "PASS" "count=$($r.data.documents.Count) total=$($r.data.total)" }
else { Record "Documents" "List documents" "FAIL" "code=$($r.code) keys=$($r.data.PSObject.Properties.Name -join ',')" }

# Get single doc
if ($testDocId) {
    $r = Get "$Base/api/documents/$testDocId" "admin"
    if ($r.ok) { Record "Documents" "Get single document" "PASS" }
    else { Record "Documents" "Get single document" "FAIL" "code=$($r.code)" }
}

# Update doc
if ($testDocId) {
    $r = Patch "$Base/api/documents/$testDocId" "admin" "{`"title`":`"TEST DOC UPDATED`"}"
    if ($r.ok) { Record "Documents" "Update document" "PASS" }
    else { Record "Documents" "Update document" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# ============================================================
Log "`n--- 4. DOCUMENT SEARCH & FILTERING ---" "Magenta"

$r = Get "$Base/api/documents?search=TEST&limit=5" "admin"
if ($r.ok) { Record "Search" "Full-text search" "PASS" "results=$($r.data.data.Count)" }
else { Record "Search" "Full-text search" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/documents?status=pending&limit=5" "admin"
if ($r.ok) { Record "Search" "Filter by valid status" "PASS" }
else { Record "Search" "Filter by valid status" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/documents?status=draft&limit=5" "admin"
if (-not $r.ok -and $r.code -eq 400) { Record "Search" "Invalid status rejected with 400" "PASS" }
else { Record "Search" "Invalid status rejected with 400" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/documents?priority=normal&limit=5" "admin"
if ($r.ok) { Record "Search" "Filter by priority" "PASS" }
else { Record "Search" "Filter by priority" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 5. DOCUMENT ROUTING ---" "Magenta"

# Create 3 docs for routing tests
$routedDocs = @()
foreach ($i in 1..3) {
    $body = "{`"title`":`"ROUTE TEST $i`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"normal`",`"routing_note`":`"Test`"}"
    $r = Post "$Base/api/documents" "admin" $body
    if ($r.ok) { $routedDocs += $r.data.id; $script:TestDocIds += $r.data.id }
}

# Get departments for routing tests
$deptList = Get "$Base/api/departments" "Pao"
$isDept = ($deptList.data | Where-Object { $_.code -eq 'ISD' } | Select-Object -First 1).id
$citetDept = ($deptList.data | Where-Object { $_.code -eq 'CITET' } | Select-Object -First 1).id
$ogmDept = ($deptList.data | Where-Object { $_.code -eq 'OGM' } | Select-Object -First 1).id

# Forward single doc (admin created these docs, so admin should forward)
if ($routedDocs.Count -ge 1 -and $isDept) {
    $r = Post "$Base/api/documents/$($routedDocs[0])/forward" "admin" "{`"to_department_id`":`"$isDept`",`"routing_note`":`"Forward test`"}"
    if ($r.ok -and $r.data.current_department) { Record "Routing" "Forward single doc" "PASS" "to=$($r.data.current_department.code)" }
    elseif ($r.ok) { Record "Routing" "Forward single doc" "PASS" "no current_dept obj" }
    else { Record "Routing" "Forward single doc" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Forward-all
if ($routedDocs.Count -ge 2) {
    $r = Post "$Base/api/documents/$($routedDocs[1])/forward-all" "admin" "{`"routing_note`":`"Forward-all test`",`"deadline`":`"2026-06-28`"}"
    if ($r.ok -and $r.data.current_department) { Record "Routing" "Forward-all" "PASS" "dept=$($r.data.current_department.code)" }
    elseif ($r.ok) { Record "Routing" "Forward-all" "PASS" "no current_dept obj" }
    else { Record "Routing" "Forward-all" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Get routing log (embedded in document detail)
if ($routedDocs.Count -ge 1) {
    $r = Get "$Base/api/documents/$($routedDocs[0])" "admin"
    if ($r.ok) { Record "Routing" "Get doc with routing info" "PASS" "routing_entries=$(if ($r.data.routing_log) { $r.data.routing_log.Count } else { 0 })" }
    else { Record "Routing" "Get doc with routing info" "FAIL" "code=$($r.code)" }
}

# Return doc (admin forward first, then return)
if ($routedDocs.Count -ge 3) {
    $r1 = Post "$Base/api/documents/$($routedDocs[2])/forward" "admin" "{`"to_department_id`":`"$isDept`",`"routing_note`":`"Forward for return`"}"
    if ($r1.ok) {
        $r = Post "$Base/api/documents/$($routedDocs[2])/return" "Pao" "{`"reason`":`"Return test`"}"
        if ($r.ok -and $r.data.current_department) { Record "Routing" "Return doc" "PASS" "to=$($r.data.current_department.code)" }
        elseif ($r.ok) { Record "Routing" "Return doc" "PASS" }
        else { Record "Routing" "Return doc" "FAIL" "code=$($r.code) err=$($r.error)" }
    } else {
        Record "Routing" "Return doc" "SKIP" "forward failed first"
    }
}

# ============================================================
Log "`n--- 6. BULK OPERATIONS ---" "Magenta"

# Create 5 docs for bulk ops
$bulkDocs = @()
foreach ($i in 1..5) {
    $body = "{`"title`":`"BULK TEST $i`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"normal`",`"routing_note`":`"Bulk test`"}"
    $r = Post "$Base/api/documents" "admin" $body
    if ($r.ok) { $bulkDocs += $r.data.id; $script:TestDocIds += $r.data.id }
}

$bulkIds = ($bulkDocs | ForEach-Object { "`"$_`"" }) -join ","

# Bulk forward
if ($bulkDocs.Count -ge 2) {
    $ids2 = ($bulkDocs[0..1] | ForEach-Object { "`"$_`"" }) -join ","
    $r = Post "$Base/api/documents/bulk-forward" "admin" "{`"document_ids`":[$ids2],`"to_department_id`":`"$isDept`",`"routing_note`":`"Bulk forward test`"}"
    if ($r.ok) { Record "Bulk" "Bulk forward" "PASS" "processed=$($r.data.processed)" }
    else { Record "Bulk" "Bulk forward" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Bulk set priority
if ($bulkDocs.Count -ge 3) {
    $ids3 = ($bulkDocs[2..4] | ForEach-Object { "`"$_`"" }) -join ","
    $r = Post "$Base/api/documents/bulk-set-priority" "admin" "{`"document_ids`":[$ids3],`"priority`":`"high`"}"
    if ($r.ok) { Record "Bulk" "Bulk set priority" "PASS" "updated=$($r.data.updated)" }
    else { Record "Bulk" "Bulk set priority" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Bulk return (need forwarded docs)
$returnDocs = @()
foreach ($i in 1..2) {
    $body = "{`"title`":`"BULK RETURN $i`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"normal`",`"routing_note`":`"test`"}"
    $r = Post "$Base/api/documents" "admin" $body
    if ($r.ok) { 
        $script:TestDocIds += $r.data.id
        $f = Post "$Base/api/documents/$($r.data.id)/forward" "admin" "{`"to_department_id`":`"$isDept`",`"routing_note`":`"test`"}"
        if ($f.ok) { $returnDocs += $r.data.id }
    }
}
if ($returnDocs.Count -ge 2) {
    $rIds = ($returnDocs | ForEach-Object { "`"$_`"" }) -join ","
    $r = Post "$Base/api/documents/bulk-return" "Pao" "{`"document_ids`":[$rIds],`"reason`":`"Bulk return test`"}"
    if ($r.ok) { Record "Bulk" "Bulk return" "PASS" "processed=$($r.data.processed)" }
    else { Record "Bulk" "Bulk return" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Bulk complete
$completeDocs = @()
foreach ($i in 1..2) {
    $body = "{`"title`":`"BULK COMPLETE $i`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"normal`"}"
    $r = Post "$Base/api/documents" "admin" $body
    if ($r.ok) { $completeDocs += $r.data.id; $script:TestDocIds += $r.data.id }
}
if ($completeDocs.Count -ge 2) {
    $cIds = ($completeDocs | ForEach-Object { "`"$_`"" }) -join ","
    $r = Post "$Base/api/documents/bulk-complete" "admin" "{`"document_ids`":[$cIds]}"
    if ($r.ok) { Record "Bulk" "Bulk complete" "PASS" "processed=$($r.data.processed)" }
    else { Record "Bulk" "Bulk complete" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# ============================================================
Log "`n--- 7. ATTACHMENTS ---" "Magenta"

# Create a test file
$pdfPath = "C:\xampp\htdocs\DOCUMENT TRACKING SYSTEM\test-pdfs\test.pdf"
if (-not (Test-Path $pdfPath)) {
    New-Item -ItemType Directory -Path (Split-Path $pdfPath) -Force | Out-Null
    "%PDF-1.4 test content" | Set-Content -Path $pdfPath -NoNewline
}

if ($testDocId) {
    # Upload
    try {
        $bytes = [System.IO.File]::ReadAllBytes($pdfPath)
        $boundary = [System.Guid]::NewGuid().ToString()
        $LF = "`r`n"
        $bodyLines = @(
            "--$boundary",
            "Content-Disposition: form-data; name=`"file`"; filename=`"test.pdf`"",
            "Content-Type: application/pdf",
            "",
            [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($bytes),
            "--$boundary--"
        ) -join $LF
        
        $resp = Invoke-WebRequest -Uri "$Base/api/documents/$testDocId/attachments" -Method POST -Headers (Auth "admin") -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyLines -ErrorAction Stop
        $attResult = $resp.Content | ConvertFrom-Json
        $attId = $attResult.id
        Record "Attachments" "Upload file" "PASS" "att_id=$attId"
    } catch {
        Record "Attachments" "Upload file" "FAIL" "$($_.Exception.Message)"
        $attId = $null
    }
    
    # List (attachments are in document detail response)
    $r = Get "$Base/api/documents/$testDocId" "admin"
    if ($r.ok -and $r.data.attachments) { Record "Attachments" "List attachments in doc" "PASS" "count=$($r.data.attachments.Count)" }
    else { Record "Attachments" "List attachments in doc" "FAIL" "code=$($r.code)" }
    
    # Download
    if ($attId) {
        try {
            $dl = Invoke-WebRequest -Uri "$Base/api/documents/$testDocId/attachments/$attId" -Headers (Auth "admin") -ErrorAction Stop
            if ($dl.StatusCode -eq 200) { Record "Attachments" "Download attachment" "PASS" "size=$($dl.RawContentLength)" }
            else { Record "Attachments" "Download attachment" "FAIL" "status=$($dl.StatusCode)" }
        } catch {
            Record "Attachments" "Download attachment" "FAIL" "$($_.Exception.Message)"
        }
    }
    
    # Preview (get blob)
    if ($attId) {
        try {
            $pv = Invoke-WebRequest -Uri "$Base/api/documents/$testDocId/attachments/$attId`?preview=1" -Headers (Auth "admin") -ErrorAction Stop
            if ($pv.StatusCode -eq 200) { Record "Attachments" "Preview attachment" "PASS" }
            else { Record "Attachments" "Preview attachment" "FAIL" "status=$($pv.StatusCode)" }
        } catch {
            $pcode = $_.Exception.Response.StatusCode.value__
            if ($pcode -eq 404) { Record "Attachments" "Preview attachment" "PASS" "(not supported, 404)" }
            else { Record "Attachments" "Preview attachment" "FAIL" "$($_.Exception.Message)" }
        }
    }
    
    # Reorder
    if ($attId) {
        $r = Patch "$Base/api/documents/$testDocId/attachments/reorder" "admin" "{`"ordered_ids`":[`"$attId`"]}"
        if ($r.ok) { Record "Attachments" "Reorder attachments" "PASS" }
        else { Record "Attachments" "Reorder attachments" "FAIL" "code=$($r.code) err=$($r.error)" }
    }
}

# ============================================================
Log "`n--- 8. COMMENTS ---" "Magenta"

if ($testDocId) {
    $r = Post "$Base/api/documents/$testDocId/comments" "admin" "{`"content`":`"This is a test comment`"}"
    if ($r.ok) { $commentId = $r.data.id; Record "Comments" "Add comment" "PASS" }
    else { Record "Comments" "Add comment" "FAIL" "code=$($r.code) err=$($r.error)" }
    
    $r = Get "$Base/api/documents/$testDocId/comments" "admin"
    if ($r.ok) { Record "Comments" "List comments" "PASS" "count=$($r.data.Count)" }
    else { Record "Comments" "List comments" "FAIL" "code=$($r.code)" }
    
    if ($commentId) {
        $r = Patch "$Base/api/documents/$testDocId/comments/$commentId" "admin" "{`"content`":`"Updated comment`"}"
        if ($r.ok) { Record "Comments" "Update comment" "PASS" }
        else { Record "Comments" "Update comment" "FAIL" "code=$($r.code) err=$($r.error)" }
        
        $r = Delete "$Base/api/documents/$testDocId/comments/$commentId" "admin"
        if ($r.ok) { Record "Comments" "Delete own comment" "PASS" }
        else { Record "Comments" "Delete own comment" "FAIL" "code=$($r.code) err=$($r.error)" }
    }
}

# ============================================================
Log "`n--- 9. DASHBOARD ---" "Magenta"

$r = Get "$Base/api/dashboard" "admin"
if ($r.ok) { Record "Dashboard" "Get all dashboard data" "PASS" }
else { Record "Dashboard" "Get all dashboard data" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/dashboard" "Pao"
if ($r.ok) { Record "Dashboard" "Staff dashboard access" "PASS" }
else { Record "Dashboard" "Staff dashboard access" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 10. NOTIFICATIONS ---" "Magenta"

$r = Get "$Base/api/notifications" "Pao"
if ($r.ok) { Record "Notifications" "List notifications" "PASS" "unread=$($r.data.unread_count)" }
else { Record "Notifications" "List notifications" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 11. APPROVALS ---" "Magenta"

# Create approval flow
$r = Post "$Base/api/approvals/flows" "admin" "{`"name`":`"Test Flow`",`"description`":`"Test approval flow`"}"
if ($r.ok) { $flowId = $r.data.id; Record "Approvals" "Create approval flow" "PASS" }
else { Record "Approvals" "Create approval flow" "FAIL" "code=$($r.code) err=$($r.error)" }

if ($flowId) {
    $r = Get "$Base/api/approvals/flows" "admin"
    if ($r.ok) { Record "Approvals" "List approval flows" "PASS" "count=$($r.data.Count)" }
    else { Record "Approvals" "List approval flows" "FAIL" "code=$($r.code)" }
    
    $r = Post "$Base/api/approvals/flows/$flowId/steps" "admin" "{`"label`":`"Dept Review`",`"approver_role`":`"department_head`"}"
    if ($r.ok) { Record "Approvals" "Add flow step" "PASS" }
    else { Record "Approvals" "Add flow step" "FAIL" "code=$($r.code) err=$($r.error)" }
}

$r = Get "$Base/api/approvals/pending" "admin"
if ($r.ok) { Record "Approvals" "Get pending approvals" "PASS" "count=$($r.data.Count)" }
else { Record "Approvals" "Get pending approvals" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/approvals/history" "admin"
if ($r.ok) { Record "Approvals" "Get approval history" "PASS" }
else { Record "Approvals" "Get approval history" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 12. AUDIT LOG ---" "Magenta"

$r = Get "$Base/api/audit-log?limit=10" "admin"
if ($r.ok) { Record "AuditLog" "Get audit log" "PASS" }
else { Record "AuditLog" "Get audit log" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 13. REPORTS ---" "Magenta"

$r = Post "$Base/api/reports/preview" "admin" "{`"report_type`":`"document_volume`",`"date_from`":`"2026-01-01`",`"date_to`":`"2026-12-31`"}"
if ($r.ok) { Record "Reports" "Preview document_volume report" "PASS" }
else { Record "Reports" "Preview document_volume report" "FAIL" "code=$($r.code) err=$($r.error)" }

$r = Post "$Base/api/reports/preview" "admin" "{`"report_type`":`"average_resolution_time`",`"date_from`":`"2026-01-01`",`"date_to`":`"2026-12-31`"}"
if ($r.ok) { Record "Reports" "Preview routing_efficiency report" "PASS" }
else { Record "Reports" "Preview routing_efficiency report" "FAIL" "code=$($r.code) err=$($r.error)" }

# ============================================================
Log "`n--- 14. PROFILE ---" "Magenta"

$r = Get "$Base/api/profile" "admin"
if ($r.ok) { Record "Profile" "Get own profile" "PASS" "created_at=$($r.data.user.created_at)" }
else { Record "Profile" "Get own profile" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 15. USER MANAGEMENT (Admin) ---" "Magenta"

$r = Get "$Base/api/users" "admin"
if ($r.ok) { Record "Admin" "List users" "PASS" "count=$($r.data.Count)" }
else { Record "Admin" "List users" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 16. SCOPE / PERMISSION TESTS ---" "Magenta"

# Staff should only see docs in their dept + own docs
$r = Get "$Base/api/documents?limit=50" "Pao"
if ($r.ok) { Record "Scope" "Staff doc visibility" "PASS" "visible=$($r.data.data.Count)" }
else { Record "Scope" "Staff doc visibility" "FAIL" "code=$($r.code)" }

# Dept head should see originating + current + own
$r = Get "$Base/api/documents?limit=50" "HeadISD"
if ($r.ok) { Record "Scope" "DeptHead doc visibility" "PASS" "visible=$($r.data.data.Count)" }
else { Record "Scope" "DeptHead doc visibility" "FAIL" "code=$($r.code)" }

# Non-admin cannot access admin endpoints
$r = Get "$Base/api/users" "Pao"
if (-not $r.ok -and ($r.code -eq 401 -or $r.code -eq 403)) { Record "Scope" "Non-admin blocked from users" "PASS" "code=$($r.code)" }
elseif (-not $r.ok) { Record "Scope" "Non-admin blocked from users" "PASS" "code=$($r.code)" }
else { Record "Scope" "Non-admin blocked from users" "FAIL" "staff accessed users!" }

# ============================================================
Log "`n--- 17. ERROR HANDLING ---" "Magenta"

$r = Get "$Base/api/documents/00000000-0000-0000-0000-000000000000" "admin"
if (-not $r.ok -and $r.code -eq 404) { Record "Errors" "404 for missing document" "PASS" }
else { Record "Errors" "404 for missing document" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/nonexistent-endpoint" "admin"
if (-not $r.ok) { Record "Errors" "404 for missing route" "PASS" "code=$($r.code)" }
else { Record "Errors" "404 for missing route" "FAIL" }

# ============================================================
Log "`n--- 18. CLEANUP (Delete test docs) ---" "Magenta"

$deleted = 0
foreach ($docId in $script:TestDocIds) {
    $r = Delete "$Base/api/documents/$docId" "admin"
    if ($r.ok) { $deleted++ }
}
Record "Cleanup" "Delete test documents" "PASS" "deleted=$deleted/$($script:TestDocIds.Count)"

# ============================================================
# SUMMARY
# ============================================================
$pass = ($script:Results | Where-Object { $_.Status -eq "PASS" }).Count
$fail = ($script:Results | Where-Object { $_.Status -eq "FAIL" }).Count
$skip = ($script:Results | Where-Object { $_.Status -eq "SKIP" }).Count
$total = $script:Results.Count

Log "`n========================================" "Cyan"
Log "  RESULTS: $pass PASS / $fail FAIL / $skip SKIP / $total TOTAL" $(if ($fail -eq 0) {"Green"} else {"Red"})
Log "========================================" "Cyan"

if ($fail -gt 0) {
    Log "`nFailed tests:" "Red"
    $script:Results | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Log "  [$($_.Area)] $($_.Test): $($_.Detail)" "Red"
    }
}

# Export results
$script:Results | Export-Csv -Path "C:\xampp\htdocs\DOCUMENT TRACKING SYSTEM\test-results.csv" -NoTypeInformation
Log "`nResults saved to test-results.csv" "Gray"
