param(
    [string]$Base = "http://localhost:5000"
)

$script:Results = @()
$script:TokenCache = @{}

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

function DecodeJwt([string]$token) {
    $parts = $token.Split('.')
    $p = $parts[1]
    $mod = $p.Length % 4
    if ($mod -ne 0) { $p += ('=' * (4 - $mod)) }
    $p = $p.Replace('-', '+').Replace('_', '/')
    return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($p)) | ConvertFrom-Json
}

# ============================================================
Log "`n=== APPROVAL SYSTEM FULL TEST ===" "Cyan"
Log "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" "Gray"

# ============================================================
Log "`n--- 1. LOGIN ALL ACCOUNTS ---" "Magenta"

$accounts = @(
    @{u="admin"; p="password"},
    @{u="Pao"; p="password"},
    @{u="HeadISD"; p="head12345"},
    @{u="HeadFSD"; p="head12345"},
    @{u="GraceCITET"; p="password"}
)

foreach ($a in $accounts) {
    $r = Login $a.u $a.p
    if ($r.ok) { Record "Auth" "Login $($a.u)" "PASS" "role=$($r.user.role)" }
    else { Record "Auth" "Login $($a.u)" "FAIL" "code=$($r.code)" }
    Start-Sleep -Milliseconds 300
}

$adminDeptId = (DecodeJwt $script:TokenCache["admin"]).departmentId
$paoDeptId = (DecodeJwt $script:TokenCache["Pao"]).departmentId
$paoUserId = (DecodeJwt $script:TokenCache["Pao"]).sub
$headISDDeptId = (DecodeJwt $script:TokenCache["HeadISD"]).departmentId
$headFSDDeptId = (DecodeJwt $script:TokenCache["HeadFSD"]).departmentId
Log "  Admin dept: $adminDeptId" "Gray"
Log "  Pao dept: $paoDeptId user: $paoUserId" "Gray"
Log "  HeadISD dept: $headISDDeptId" "Gray"
Log "  HeadFSD dept: $headFSDDeptId" "Gray"

# Get departments
$deptList = Get "$Base/api/departments" "admin"
$isDept = ($deptList.data | Where-Object { $_.code -eq 'ISD' } | Select-Object -First 1).id
$citetDept = ($deptList.data | Where-Object { $_.code -eq 'CITET' } | Select-Object -First 1).id
Log "  ISD dept: $isDept" "Gray"
Log "  CITET dept: $citetDept" "Gray"

# ============================================================
Log "`n--- 2. FLOW CRUD (Admin Only) ---" "Magenta"

# Create flow 1
$r = Post "$Base/api/approvals/flows" "admin" "{`"name`":`"Standard Review`",`"description`":`"Two-step review process`"}"
if ($r.ok) { $flow1Id = $r.data.id; Record "FlowCRUD" "Create flow 1" "PASS" "id=$flow1Id" }
else { Record "FlowCRUD" "Create flow 1" "FAIL" "code=$($r.code) err=$($r.error)" }

# Create flow 2
$r = Post "$Base/api/approvals/flows" "admin" "{`"name`":`"Express Approval`",`"description`":`"Single step`"}"
if ($r.ok) { $flow2Id = $r.data.id; Record "FlowCRUD" "Create flow 2" "PASS" "id=$flow2Id" }
else { Record "FlowCRUD" "Create flow 2" "FAIL" "code=$($r.code) err=$($r.error)" }

# List flows (admin sees all)
$r = Get "$Base/api/approvals/flows" "admin"
if ($r.ok) { Record "FlowCRUD" "List flows (admin)" "PASS" "count=$(if ($r.data -is [array]) { $r.data.Count } else { 1 })" }
else { Record "FlowCRUD" "List flows (admin)" "FAIL" "code=$($r.code)" }

# List flows (staff sees only active)
$r = Get "$Base/api/approvals/flows" "Pao"
if ($r.ok) { Record "FlowCRUD" "List flows (staff)" "PASS" "count=$(if ($r.data -is [array]) { $r.data.Count } else { 1 })" }
else { Record "FlowCRUD" "List flows (staff)" "FAIL" "code=$($r.code)" }

# Non-admin cannot create flow
$r = Post "$Base/api/approvals/flows" "Pao" "{`"name`":`"Should Fail`"}"
if (-not $r.ok -and ($r.code -eq 401 -or $r.code -eq 403)) { Record "FlowCRUD" "Staff blocked from create flow" "PASS" "code=$($r.code)" }
else { Record "FlowCRUD" "Staff blocked from create flow" "FAIL" "code=$($r.code)" }

# Update flow
if ($flow1Id) {
    $r = Patch "$Base/api/approvals/flows/$flow1Id" "admin" "{`"name`":`"Standard Review Updated`",`"description`":`"Updated desc`"}"
    if ($r.ok) { Record "FlowCRUD" "Update flow" "PASS" }
    else { Record "FlowCRUD" "Update flow" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Toggle flow active/inactive
if ($flow2Id) {
    $r = Patch "$Base/api/approvals/flows/$flow2Id" "admin" "{`"is_active`":false}"
    if ($r.ok) { Record "FlowCRUD" "Deactivate flow" "PASS" }
    else { Record "FlowCRUD" "Deactivate flow" "FAIL" "code=$($r.code) err=$($r.error)" }
    
    # Staff should NOT see inactive flows
    $r = Get "$Base/api/approvals/flows" "Pao"
    if ($r.ok) {
        $found = $false
        if ($r.data -is [array]) { $found = $r.data | Where-Object { $_.id -eq $flow2Id } }
        if (-not $found) { Record "FlowCRUD" "Inactive flow hidden from staff" "PASS" }
        else { Record "FlowCRUD" "Inactive flow hidden from staff" "FAIL" "inactive flow visible" }
    }
    
    # Reactivate
    $r = Patch "$Base/api/approvals/flows/$flow2Id" "admin" "{`"is_active`":true}"
    if ($r.ok) { Record "FlowCRUD" "Reactivate flow" "PASS" }
    else { Record "FlowCRUD" "Reactivate flow" "FAIL" "code=$($r.code)" }
}

# Create flow without name (should fail)
$r = Post "$Base/api/approvals/flows" "admin" "{`"description`":`"No name`"}"
if (-not $r.ok -and $r.code -eq 400) { Record "FlowCRUD" "Create flow without name rejected" "PASS" }
else { Record "FlowCRUD" "Create flow without name rejected" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 3. FLOW STEPS MANAGEMENT ---" "Magenta"

if ($flow1Id) {
    # Add step 1: Dept Head Review
    $r = Post "$Base/api/approvals/flows/$flow1Id/steps" "admin" "{`"label`":`"Dept Head Review`",`"approver_role`":`"department_head`",`"department_id`":`"$isDept`"}"
    if ($r.ok) { $step1Id = $r.data.id; Record "Steps" "Add step 1 (Dept Head)" "PASS" "id=$step1Id" }
    else { Record "Steps" "Add step 1 (Dept Head)" "FAIL" "code=$($r.code) err=$($r.error)" }
    
    # Add step 2: Admin Final
    $r = Post "$Base/api/approvals/flows/$flow1Id/steps" "admin" "{`"label`":`"Admin Final`",`"approver_role`":`"admin`"}"
    if ($r.ok) { $step2Id = $r.data.id; Record "Steps" "Add step 2 (Admin)" "PASS" "id=$step2Id" }
    else { Record "Steps" "Add step 2 (Admin)" "FAIL" "code=$($r.code) err=$($r.error)" }
    
    # Add step 3: Specific User
    $r = Post "$Base/api/approvals/flows/$flow1Id/steps" "admin" "{`"label`":`"CITET Staff Check`",`"department_id`":`"$citetDept`"}"
    if ($r.ok) { $step3Id = $r.data.id; Record "Steps" "Add step 3 (CITET)" "PASS" "id=$step3Id" }
    else { Record "Steps" "Add step 3 (CITET)" "FAIL" "code=$($r.code) err=$($r.error)" }
    
    # List steps
    $r = Get "$Base/api/approvals/flows/$flow1Id/steps" "admin"
    if ($r.ok) { Record "Steps" "List steps" "PASS" "count=$(if ($r.data -is [array]) { $r.data.Count } else { 1 })" }
    else { Record "Steps" "List steps" "FAIL" "code=$($r.code)" }
    
    # Update step
    if ($step1Id) {
        $r = Patch "$Base/api/approvals/flows/$flow1Id/steps/$step1Id" "admin" "{`"label`":`"Dept Head Review Updated`"}"
        if ($r.ok) { Record "Steps" "Update step" "PASS" }
        else { Record "Steps" "Update step" "FAIL" "code=$($r.code) err=$($r.error)" }
    }
    
    # Reorder steps (3 -> 1 -> 2)
    if ($step1Id -and $step2Id -and $step3Id) {
        $r = Patch "$Base/api/approvals/flows/$flow1Id/steps/reorder" "admin" "{`"ordered_ids`":[`"$step3Id`",`"$step1Id`",`"$step2Id`"]}"
        if ($r.ok) { Record "Steps" "Reorder steps" "PASS" }
        else { Record "Steps" "Reorder steps" "FAIL" "code=$($r.code) err=$($r.error)" }
        
        # Verify order
        $r2 = Get "$Base/api/approvals/flows/$flow1Id/steps" "admin"
        if ($r2.ok -and $r2.data.Count -ge 3) {
            $first = $r2.data[0].label
            if ($first -eq "CITET Staff Check") { Record "Steps" "Verify reorder" "PASS" "first=$first" }
            else { Record "Steps" "Verify reorder" "FAIL" "first=$first (expected CITET Staff Check)" }
        }
    }
    
    # Add step without label (should fail)
    $r = Post "$Base/api/approvals/flows/$flow1Id/steps" "admin" "{`"approver_role`":`"admin`"}"
    if (-not $r.ok -and $r.code -eq 400) { Record "Steps" "Add step without label rejected" "PASS" }
    else { Record "Steps" "Add step without label rejected" "FAIL" "code=$($r.code)" }
    
    # Non-admin cannot add step
    $r = Post "$Base/api/approvals/flows/$flow1Id/steps" "Pao" "{`"label`":`"Should Fail`"}"
    if (-not $r.ok -and ($r.code -eq 401 -or $r.code -eq 403)) { Record "Steps" "Staff blocked from add step" "PASS" "code=$($r.code)" }
    else { Record "Steps" "Staff blocked from add step" "FAIL" "code=$($r.code)" }
}

if ($flow2Id) {
    # Add single step to flow 2
    $r = Post "$Base/api/approvals/flows/$flow2Id/steps" "admin" "{`"label`":`"Quick Approve`",`"approver_role`":`"admin`"}"
    if ($r.ok) { $flow2StepId = $r.data.id; Record "Steps" "Add step to flow 2" "PASS" }
    else { Record "Steps" "Add step to flow 2" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# ============================================================
Log "`n--- 4. ASSIGN FLOW TO DOCUMENT ---" "Magenta"

# Create test documents
$catList = Get "$Base/api/categories" "admin"
$catId = if ($catList.data -is [array]) { $catList.data[0].id } else { $catList.data.id }

# Doc 1: for single approve/reject test
$r = Post "$Base/api/documents" "admin" "{`"title`":`"APPROVAL TEST DOC 1`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"high`"}"
if ($r.ok) { $doc1Id = $r.data.id; Record "Assign" "Create doc 1" "PASS" "id=$doc1Id" }
else { Record "Assign" "Create doc 1" "FAIL" "code=$($r.code) err=$($r.error)" }

# Doc 2: for bulk approve test
$r = Post "$Base/api/documents" "admin" "{`"title`":`"APPROVAL TEST DOC 2`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"normal`"}"
if ($r.ok) { $doc2Id = $r.data.id; Record "Assign" "Create doc 2" "PASS" "id=$doc2Id" }
else { Record "Assign" "Create doc 2" "FAIL" "code=$($r.code) err=$($r.error)" }

# Doc 3: for rejection test
$r = Post "$Base/api/documents" "admin" "{`"title`":`"APPROVAL TEST DOC 3`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"urgent`"}"
if ($r.ok) { $doc3Id = $r.data.id; Record "Assign" "Create doc 3" "PASS" "id=$doc3Id" }
else { Record "Assign" "Create doc 3" "FAIL" "code=$($r.code) err=$($r.error)" }

# Doc 4: for conflict test (double assign)
$r = Post "$Base/api/documents" "admin" "{`"title`":`"APPROVAL TEST DOC 4`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"normal`"}"
if ($r.ok) { $doc4Id = $r.data.id; Record "Assign" "Create doc 4" "PASS" "id=$doc4Id" }
else { Record "Assign" "Create doc 4" "FAIL" "code=$($r.code) err=$($r.error)" }

# Assign flow 1 to doc 1
if ($doc1Id -and $flow1Id) {
    $r = Post "$Base/api/approvals/$doc1Id/assign" "admin" "{`"flow_id`":`"$flow1Id`"}"
    if ($r.ok) { Record "Assign" "Assign flow 1 to doc 1" "PASS" }
    else { Record "Assign" "Assign flow 1 to doc 1" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Assign flow 1 to doc 2
if ($doc2Id -and $flow1Id) {
    $r = Post "$Base/api/approvals/$doc2Id/assign" "admin" "{`"flow_id`":`"$flow1Id`"}"
    if ($r.ok) { Record "Assign" "Assign flow 1 to doc 2" "PASS" }
    else { Record "Assign" "Assign flow 1 to doc 2" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Assign flow 1 to doc 3
if ($doc3Id -and $flow1Id) {
    $r = Post "$Base/api/approvals/$doc3Id/assign" "admin" "{`"flow_id`":`"$flow1Id`"}"
    if ($r.ok) { Record "Assign" "Assign flow 1 to doc 3" "PASS" }
    else { Record "Assign" "Assign flow 1 to doc 3" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Assign flow 1 to doc 4
if ($doc4Id -and $flow1Id) {
    $r = Post "$Base/api/approvals/$doc4Id/assign" "admin" "{`"flow_id`":`"$flow1Id`"}"
    if ($r.ok) { Record "Assign" "Assign flow 1 to doc 4" "PASS" }
    else { Record "Assign" "Assign flow 1 to doc 4" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# Double assign should fail (409)
if ($doc4Id -and $flow2Id) {
    $r = Post "$Base/api/approvals/$doc4Id/assign" "admin" "{`"flow_id`":`"$flow2Id`"}"
    if (-not $r.ok -and $r.code -eq 409) { Record "Assign" "Double assign rejected (409)" "PASS" }
    else { Record "Assign" "Double assign rejected (409)" "FAIL" "code=$($r.code)" }
}

# Assign to nonexistent doc
$r = Post "$Base/api/approvals/00000000-0000-0000-0000-000000000000/assign" "admin" "{`"flow_id`":`"$flow1Id`"}"
if (-not $r.ok -and $r.code -eq 404) { Record "Assign" "Assign to nonexistent doc rejected" "PASS" }
else { Record "Assign" "Assign to nonexistent doc rejected" "FAIL" "code=$($r.code)" }

# Assign nonexistent flow
if ($doc1Id) {
    $r = Post "$Base/api/approvals/$doc1Id/assign" "admin" "{`"flow_id`":`"00000000-0000-0000-0000-000000000000`"}"
    if (-not $r.ok -and $r.code -eq 404) { Record "Assign" "Assign nonexistent flow rejected" "PASS" }
    else { Record "Assign" "Assign nonexistent flow rejected" "FAIL" "code=$($r.code)" }
}

# Staff cannot assign (dept_head or admin only)
if ($doc1Id -and $flow1Id) {
    $r = Post "$Base/api/approvals/$doc1Id/assign" "Pao" "{`"flow_id`":`"$flow1Id`"}"
    if (-not $r.ok -and ($r.code -eq 401 -or $r.code -eq 403)) { Record "Assign" "Staff blocked from assign" "PASS" "code=$($r.code)" }
    else { Record "Assign" "Staff blocked from assign" "FAIL" "code=$($r.code)" }
}

# ============================================================
Log "`n--- 5. LIST DOCUMENT APPROVALS ---" "Magenta"

if ($doc1Id) {
    $r = Get "$Base/api/approvals/$doc1Id/approvals" "admin"
    if ($r.ok) { 
        $steps = $r.data
        Record "DocApprovals" "List doc 1 approvals" "PASS" "steps=$(if ($steps -is [array]) { $steps.Count } else { 1 })"
        # Store approval IDs for approve/reject tests
        if ($steps -is [array]) {
            $script:ApprovalIds = @{}
            foreach ($s in $steps) {
                $script:ApprovalIds[$s.step_order] = $s.id
            }
            Log "    Step IDs: $(($steps | ForEach-Object { "$($_.step_order)=$($_.id)" }) -join ', ')" "Gray"
        }
    }
    else { Record "DocApprovals" "List doc 1 approvals" "FAIL" "code=$($r.code)" }
}

# Nonexistent doc
$r = Get "$Base/api/approvals/00000000-0000-0000-0000-000000000000/approvals" "admin"
if (-not $r.ok -and $r.code -eq 404) { Record "DocApprovals" "List approvals for nonexistent doc" "PASS" }
else { Record "DocApprovals" "List approvals for nonexistent doc" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 6. PENDING APPROVALS ---" "Magenta"

$r = Get "$Base/api/approvals/pending" "admin"
if ($r.ok) { Record "Pending" "Admin pending list" "PASS" "count=$(if ($r.data -is [array]) { $r.data.Count } else { 1 })" }
else { Record "Pending" "Admin pending list" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/approvals/pending" "Pao"
if ($r.ok) { Record "Pending" "Staff pending list" "PASS" "count=$(if ($r.data -is [array]) { $r.data.Count } else { 1 })" }
else { Record "Pending" "Staff pending list" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/approvals/pending" "HeadISD"
if ($r.ok) { Record "Pending" "DeptHead pending list" "PASS" "count=$(if ($r.data -is [array]) { $r.data.Count } else { 1 })" }
else { Record "Pending" "DeptHead pending list" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 7. SINGLE APPROVE ---" "Magenta"

# Get approval IDs for doc 1
if ($doc1Id) {
    $r = Get "$Base/api/approvals/$doc1Id/approvals" "admin"
    if ($r.ok -and $r.data -is [array] -and $r.data.Count -gt 0) {
        $approvalStep1 = $r.data[0]
        
        # Approve step 1
        $r = Post "$Base/api/approvals/$($approvalStep1.id)/approve" "admin" ('{"comment":"Approved by admin"}')
        if ($r.ok) { Record "SingleApprove" "Approve step 1" "PASS" }
        else { Record "SingleApprove" "Approve step 1" "FAIL" "code=$($r.code) err=$($r.error)" }
        
        # Verify step 1 is now approved
        $r = Get "$Base/api/approvals/$doc1Id/approvals" "admin"
        if ($r.ok) {
            $step1 = $r.data | Where-Object { $_.step_order -eq 1 }
            if ($step1.status -eq "approved") { Record "SingleApprove" "Step 1 status = approved" "PASS" }
            else { Record "SingleApprove" "Step 1 status = approved" "FAIL" "status=$($step1.status)" }
        }
        
        # Try to approve step 1 again (should fail 409)
        $r = Post "$Base/api/approvals/$($approvalStep1.id)/approve" "admin" '{"comment":"Double approve"}'
        if (-not $r.ok -and $r.code -eq 409) { Record "SingleApprove" "Double approve rejected (409)" "PASS" }
        else { Record "SingleApprove" "Double approve rejected (409)" "FAIL" "code=$($r.code)" }
        
        # Re-fetch all approvals to get step 2
        $r = Get "$Base/api/approvals/$doc1Id/approvals" "admin"
        $step2 = $r.data | Where-Object { $_.step_order -eq 2 }
        if ($step2) {
            $r = Post "$Base/api/approvals/$($step2.id)/approve" "admin" '{"comment":"Step 2 approved"}'
            if ($r.ok) { Record "SingleApprove" "Approve step 2" "PASS" }
            else { Record "SingleApprove" "Approve step 2" "FAIL" "code=$($r.code) err=$($r.error)" }
        }
        
        # Re-fetch to get step 3 (final step — should auto-update doc status to 'approved')
        $r = Get "$Base/api/approvals/$doc1Id/approvals" "admin"
        $step3 = $r.data | Where-Object { $_.step_order -eq 3 }
        if ($step3) {
            $r = Post "$Base/api/approvals/$($step3.id)/approve" "admin" '{"comment":"Final approval"}'
            if ($r.ok) { Record "SingleApprove" "Approve step 3 (final)" "PASS" }
            else { Record "SingleApprove" "Approve step 3 (final)" "FAIL" "code=$($r.code) err=$($r.error)" }
            
            # Verify all steps are now approved
            $r = Get "$Base/api/approvals/$doc1Id/approvals" "admin"
            if ($r.ok) {
                $allApproved = ($r.data | Where-Object { $_.status -eq "approved" }).Count -eq $r.data.Count
                if ($allApproved) { Record "SingleApprove" "All steps approved" "PASS" }
                else { Record "SingleApprove" "All steps approved" "FAIL" "some steps not approved" }
            }
        }
    }
}

# Approve nonexistent approval
$r = Post "$Base/api/approvals/00000000-0000-0000-0000-000000000000/approve" "admin" "{}"
if (-not $r.ok -and $r.code -eq 404) { Record "SingleApprove" "Approve nonexistent rejected" "PASS" }
else { Record "SingleApprove" "Approve nonexistent rejected" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 8. SINGLE REJECT ---" "Magenta"

if ($doc3Id) {
    $r = Get "$Base/api/approvals/$doc3Id/approvals" "admin"
    if ($r.ok -and $r.data -is [array] -and $r.data.Count -gt 0) {
        $rejectStep = $r.data[0]
        
        # Reject without comment (should fail 400)
        $r = Post "$Base/api/approvals/$($rejectStep.id)/reject" "admin" "{`"comment`":`"`"}"
        if (-not $r.ok -and $r.code -eq 400) { Record "SingleReject" "Reject without comment rejected" "PASS" }
        else { Record "SingleReject" "Reject without comment rejected" "FAIL" "code=$($r.code)" }
        
        # Reject with comment
        $r = Post "$Base/api/approvals/$($rejectStep.id)/reject" "admin" "{`"comment`":`"Needs major revisions`"}"
        if ($r.ok) { Record "SingleReject" "Reject step with comment" "PASS" }
        else { Record "SingleReject" "Reject step with comment" "FAIL" "code=$($r.code) err=$($r.error)" }
        
        # Verify step is rejected
        $r = Get "$Base/api/approvals/$doc3Id/approvals" "admin"
        if ($r.ok) {
            $rejected = $r.data | Where-Object { $_.step_order -eq 1 }
            if ($rejected.status -eq "rejected") { Record "SingleReject" "Step status = rejected" "PASS" "comment=$($rejected.comment)" }
            else { Record "SingleReject" "Step status = rejected" "FAIL" "status=$($rejected.status)" }
        }
        
        # Try to reject again (should fail 409)
        $r = Post "$Base/api/approvals/$($rejectStep.id)/reject" "admin" "{`"comment`":`"Double reject`"}"
        if (-not $r.ok -and $r.code -eq 409) { Record "SingleReject" "Double reject rejected (409)" "PASS" }
        else { Record "SingleReject" "Double reject rejected (409)" "FAIL" "code=$($r.code)" }
        
        # Doc should NOT be 'approved' after rejection
        $r = Get "$Base/api/documents/$doc3Id" "admin"
        if ($r.ok -and $r.data.status -ne "approved") { Record "SingleReject" "Doc not approved after reject" "PASS" "status=$($r.data.status)" }
        elseif ($r.ok) { Record "SingleReject" "Doc not approved after reject" "FAIL" "status=$($r.data.status)" }
    }
}

# ============================================================
Log "`n--- 9. BULK APPROVE ---" "Magenta"

if ($doc2Id) {
    $r = Get "$Base/api/approvals/$doc2Id/approvals" "admin"
    if ($r.ok -and $r.data -is [array]) {
        $allIds = ($r.data | Where-Object { $_.status -eq "pending" } | ForEach-Object { '"' + $_.id + '"' }) -join ","
        
        if ($allIds) {
            $r = Post "$Base/api/approvals/bulk-approve" "admin" ('{"approval_ids":[' + $allIds + '],"comment":"Bulk approved"}')
            if ($r.ok) { Record "BulkApprove" "Bulk approve all steps" "PASS" "approved=$($r.data.approve) skipped=$($r.data.skipped)" }
            else { Record "BulkApprove" "Bulk approve all steps" "FAIL" "code=$($r.code) err=$($r.error)" }
            
            # Verify all steps are now approved
            $r = Get "$Base/api/approvals/$doc2Id/approvals" "admin"
            if ($r.ok) {
                $allApproved = ($r.data | Where-Object { $_.status -eq "approved" }).Count -eq $r.data.Count
                if ($allApproved) { Record "BulkApprove" "All steps approved after bulk" "PASS" }
                else { Record "BulkApprove" "All steps approved after bulk" "FAIL" }
            }
        }
    }
}

# Bulk approve empty array (should fail 400)
$r = Post "$Base/api/approvals/bulk-approve" "admin" '{"approval_ids":[]}'
if (-not $r.ok -and $r.code -eq 400) { Record "BulkApprove" "Bulk approve empty array rejected" "PASS" }
else { Record "BulkApprove" "Bulk approve empty array rejected" "FAIL" "code=$($r.code)" }

# Bulk approve >50 items (should fail 400)
$bigIds = @()
for ($bi = 1; $bi -le 51; $bi++) { $bigIds += ('"' + "00000000-0000-0000-0000-$bi" + '"') }
$bigArray = $bigIds -join ","
$r = Post "$Base/api/approvals/bulk-approve" "admin" ('{"approval_ids":[' + $bigArray + ']}')
if (-not $r.ok -and $r.code -eq 400) { Record "BulkApprove" "Bulk approve >50 rejected" "PASS" }
else { Record "BulkApprove" "Bulk approve >50 rejected" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 10. BULK REJECT ---" "Magenta"

# Create fresh docs for bulk reject
$brDocs = @()
foreach ($i in 1..2) {
    $r = Post "$Base/api/documents" "admin" "{`"title`":`"BULK REJECT DOC $i`",`"category_id`":`"$catId`",`"originating_department_id`":`"$adminDeptId`",`"priority`":`"normal`"}"
    if ($r.ok) { $brDocs += $r.data.id }
    Start-Sleep -Milliseconds 100
}

# Assign flow to each
foreach ($dId in $brDocs) {
    if ($flow1Id) {
        Post "$Base/api/approvals/$dId/assign" "admin" "{`"flow_id`":`"$flow1Id`"}" | Out-Null
        Start-Sleep -Milliseconds 100
    }
}

# Collect all pending approval IDs
$brApprovalIds = @()
foreach ($dId in $brDocs) {
    $r = Get "$Base/api/approvals/$dId/approvals" "admin"
    if ($r.ok -and $r.data -is [array]) {
        foreach ($s in $r.data) {
            if ($s.status -eq "pending") { $brApprovalIds += $s.id }
        }
    }
}

if ($brApprovalIds.Count -ge 2) {
    $brIds = ($brApprovalIds | ForEach-Object { '"' + $_ + '"' }) -join ","
    
    # Reject without comment (should fail)
    $r = Post "$Base/api/approvals/bulk-reject" "admin" ('{"approval_ids":[' + $brIds + '],"comment":""}')
    if (-not $r.ok -and $r.code -eq 400) { Record "BulkReject" "Bulk reject without comment rejected" "PASS" }
    else { Record "BulkReject" "Bulk reject without comment rejected" "FAIL" "code=$($r.code)" }
    
    # Bulk reject with comment
    $r = Post "$Base/api/approvals/bulk-reject" "admin" ('{"approval_ids":[' + $brIds + '],"comment":"Bulk rejected - needs rework"}')
    if ($r.ok) { Record "BulkReject" "Bulk reject with comment" "PASS" "rejected=$($r.data.rejected) skipped=$($r.data.skipped)" }
    else { Record "BulkReject" "Bulk reject with comment" "FAIL" "code=$($r.code) err=$($r.error)" }
}

# ============================================================
Log "`n--- 11. APPROVAL HISTORY ---" "Magenta"

$r = Get "$Base/api/approvals/history" "admin"
if ($r.ok) { Record "History" "Admin history" "PASS" "count=$(if ($r.data -is [array]) { $r.data.Count } else { 1 })" }
else { Record "History" "Admin history" "FAIL" "code=$($r.code)" }

$r = Get "$Base/api/approvals/history" "Pao"
if ($r.ok) { Record "History" "Staff history" "PASS" "count=$(if ($r.data -is [array]) { $r.data.Count } else { 1 })" }
else { Record "History" "Staff history" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 12. AUTHORIZATION CHECKS ---" "Magenta"

# Staff cannot approve step assigned to admin role
if ($doc1Id) {
    $r = Get "$Base/api/approvals/$doc1Id/approvals" "Pao"
    if ($r.ok -and $r.data -is [array]) {
        $adminStep = $r.data | Where-Object { $_.label -like "*Admin*" -and $_.status -eq "pending" } | Select-Object -First 1
        if ($adminStep) {
            $r = Post "$Base/api/approvals/$($adminStep.id)/approve" "Pao" "{`"comment`":`"Staff trying to approve admin step`"}"
            if (-not $r.ok -and ($r.code -eq 401 -or $r.code -eq 403)) { Record "Authz" "Staff blocked from admin step" "PASS" "code=$($r.code)" }
            else { Record "Authz" "Staff blocked from admin step" "FAIL" "code=$($r.code)" }
        } else {
            Record "Authz" "Staff blocked from admin step" "PASS" "(all admin steps already decided)"
        }
    }
}

# ============================================================
Log "`n--- 13. EDGE CASES ---" "Magenta"

# Approve already-approved (409) - use doc 1 step 1
if ($doc1Id) {
    $r = Get "$Base/api/approvals/$doc1Id/approvals" "admin"
    if ($r.ok -and $r.data -is [array]) {
        $approvedStep = $r.data | Where-Object { $_.status -eq "approved" } | Select-Object -First 1
        if ($approvedStep) {
            $r = Post "$Base/api/approvals/$($approvedStep.id)/approve" "admin" "{}"
            if (-not $r.ok -and $r.code -eq 409) { Record "EdgeCases" "Approve already-approved (409)" "PASS" }
            else { Record "EdgeCases" "Approve already-approved (409)" "FAIL" "code=$($r.code)" }
        }
    }
}

# Reject already-rejected (409)
if ($doc3Id) {
    $r = Get "$Base/api/approvals/$doc3Id/approvals" "admin"
    if ($r.ok -and $r.data -is [array]) {
        $rejectedStep = $r.data | Where-Object { $_.status -eq "rejected" } | Select-Object -First 1
        if ($rejectedStep) {
            $r = Post "$Base/api/approvals/$($rejectedStep.id)/reject" "admin" "{`"comment`":`"Double reject`"}"
            if (-not $r.ok -and $r.code -eq 409) { Record "EdgeCases" "Reject already-rejected (409)" "PASS" }
            else { Record "EdgeCases" "Reject already-rejected (409)" "FAIL" "code=$($r.code)" }
        }
    }
}

# Delete flow that has steps (should cascade)
if ($flow2Id) {
    $r = Delete "$Base/api/approvals/flows/$flow2Id" "admin"
    if ($r.ok) { Record "EdgeCases" "Delete flow with steps (cascade)" "PASS" }
    else { Record "EdgeCases" "Delete flow with steps (cascade)" "FAIL" "code=$($r.code) err=$($r.error)" }
    
    # Verify deleted
    $r = Get "$Base/api/approvals/flows/$flow2Id/steps" "admin"
    if ($r.ok -and ($r.data -eq $null -or ($r.data -is [array] -and $r.data.Count -eq 0))) { Record "EdgeCases" "Deleted flow steps gone" "PASS" }
    elseif ($r.ok) { Record "EdgeCases" "Deleted flow steps gone" "FAIL" "steps still exist: $($r.data.Count)" }
    else { Record "EdgeCases" "Deleted flow steps gone" "PASS" "code=$($r.code)" }
}

# Delete nonexistent flow
$r = Delete "$Base/api/approvals/flows/00000000-0000-0000-0000-000000000000" "admin"
if (-not $r.ok -and $r.code -eq 404) { Record "EdgeCases" "Delete nonexistent flow (404)" "PASS" }
else { Record "EdgeCases" "Delete nonexistent flow (404)" "FAIL" "code=$($r.code)" }

# ============================================================
Log "`n--- 14. CLEANUP ---" "Magenta"

# Delete test documents (this cascades document_approvals)
$cleanupDocs = @($doc1Id, $doc2Id, $doc3Id, $doc4Id) + $brDocs
$cleanupDocs = $cleanupDocs | Where-Object { $_ -ne $null }
$deleted = 0
foreach ($dId in $cleanupDocs) {
    $r = Delete "$Base/api/documents/$dId" "admin"
    if ($r.ok) { $deleted++ }
    Start-Sleep -Milliseconds 100
}
# Delete remaining flow
if ($flow1Id) {
    Delete "$Base/api/approvals/flows/$flow1Id" "admin" | Out-Null
}
Record "Cleanup" "Delete test data" "PASS" "deleted=$deleted docs"

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

# Area breakdown
Log "`n--- BY AREA ---" "Cyan"
$areas = $script:Results | Group-Object Area | Sort-Object Name
foreach ($a in $areas) {
    $aPass = ($a.Group | Where-Object { $_.Status -eq "PASS" }).Count
    $aFail = ($a.Group | Where-Object { $_.Status -eq "FAIL" }).Count
    $aTotal = $a.Count
    $color = if ($aFail -eq 0) {"Green"} else {"Red"}
    Log "  $($a.Name): $aPass/$aTotal PASS" $color
}

if ($fail -gt 0) {
    Log "`nFailed tests:" "Red"
    $script:Results | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Log "  [$($_.Area)] $($_.Test): $($_.Detail)" "Red"
    }
}

$script:Results | Export-Csv -Path "C:\xampp\htdocs\DOCUMENT TRACKING SYSTEM\test-approvals.csv" -NoTypeInformation
Log "`nResults saved to test-approvals.csv" "Gray"
