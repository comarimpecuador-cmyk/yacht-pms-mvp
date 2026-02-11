# qa-smoke-quick.ps1 - PMS Yacht Platform QA Smoke Tests (Quick Mode)

$ErrorActionPreference = 'Stop'

# Configuración
$BASE_URL = "http://localhost:3001"
$JWT_TOKEN = ""
$REFRESH_TOKEN = ""

# Timeout de 3 segundos para conexiones
$REQUEST_TIMEOUT = 3000

# Usuarios de prueba
$USERS = @(
    @{ Email = "systemadmin@reinotierra.com"; Password = "sysadmin123"; Role = "SystemAdmin"; Description = "SystemAdmin - Bypass total" },
    @{ Email = "admin@reinotierra.com"; Password = "admin123"; Role = "Admin"; Description = "Admin - Requiere yacht access" },
    @{ Email = "captain@reinotierra.com"; Password = "captain123"; Role = "Captain"; Description = "Captain - Acceso yacht 1" },
    @{ Email = "engineer@reinotierra.com"; Password = "engineer123"; Role = "Engineer"; Description = "Engineer - Acceso yacht 1" },
    @{ Email = "steward@reinotierra.com"; Password = "steward123"; Role = "Steward"; Description = "Steward - Acceso yacht 1" }
)

function Write-Section {
    param([string]$Title)
    Write-Host "`n=== $Title ===" -ForegroundColor Cyan
}

function Write-Test {
    param([string]$Label, [string]$Status, [string]$Details = "")
    if ($Status -eq "PASS") {
        Write-Host "[PASS] $Label" -ForegroundColor Green
    } elseif ($Status -eq "FAIL") {
        Write-Host "[FAIL] $Label" -ForegroundColor Red
    } elseif ($Status -eq "INFO") {
        Write-Host "[INFO] $Label" -ForegroundColor Yellow
    }
    if ($Details) {
        Write-Host "       $Details" -ForegroundColor Gray
    }
}

Write-Host "[TEST] PMS Yacht Platform - QA Smoke Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ============================================================================
# 1. TEST HEALTH CHECK
# ============================================================================
Write-Section "Health Check"

try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/health" -Method Get -TimeoutSec 5
    Write-Test -Label "GET /health" -Status "PASS" -Details "Status: $($health.status)"
} catch {
    Write-Test -Label "GET /health" -Status "FAIL" -Details "Error: Unable to connect to server"
}

# ============================================================================
# 2. TEST LOGIN CON DIFERENTES ROLES
# ============================================================================
Write-Section "Authentication - Login Tests"

$tokens = @{}

foreach ($user in $USERS) {
    $loginBody = @{
        email = $user.Email
        password = $user.Password
    } | ConvertTo-Json

    try {
        $login = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -TimeoutSec 5
        $tokens[$user.Role] = $login.access_token
        if ($user.Role -eq "Admin") {
            $REFRESH_TOKEN = $login.refresh_token
        }
        Write-Test -Label "POST /auth/login ($($user.Role))" -Status "PASS" -Details "Email: $($user.Email)"
    } catch {
        Write-Test -Label "POST /auth/login ($($user.Role))" -Status "FAIL" -Details "Error: Unable to connect to server"
    }
}

# ============================================================================
# 3. TEST REFRESH TOKEN
# ============================================================================
Write-Section "Token Refresh"

if ($REFRESH_TOKEN) {
    $refreshBody = @{ refreshToken = $REFRESH_TOKEN } | ConvertTo-Json
    try {
        $refresh = Invoke-RestMethod -Uri "$BASE_URL/auth/refresh" -Method Post -Body $refreshBody -ContentType "application/json" -TimeoutSec 5
        $JWT_TOKEN = $refresh.access_token
        Write-Test -Label "POST /auth/refresh (valid)" -Status "PASS" -Details "Token refreshed successfully"
    } catch {
        Write-Test -Label "POST /auth/refresh (valid)" -Status "FAIL" -Details "Error: Unable to connect to server"
    }
}

# Test: Refresh token inválido -> debe retornar 401
Write-Host "`n[Security] Testing Invalid Refresh Token..." -ForegroundColor Yellow
$invalidRefreshBody = @{ refreshToken = "invalid-token-12345" } | ConvertTo-Json
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/auth/refresh" -Method Post -Body $invalidRefreshBody -ContentType "application/json" -TimeoutSec 5
    Write-Test -Label "POST /auth/refresh (invalid)" -Status "FAIL" -Details "Should have returned 401"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 401) {
        Write-Test -Label "POST /auth/refresh (invalid)" -Status "PASS" -Details "Correctly rejected (401 Unauthorized)"
    } else {
        Write-Test -Label "POST /auth/refresh (invalid)" -Status "FAIL" -Details "Got $status instead of 401"
    }
}

# ============================================================================
# 4. TEST ENDPOINTS PROTEGIDOS - ADMIN BYPASS
# ============================================================================
Write-Section "Protected Endpoints - Admin Bypass Test"

$headers = @{ Authorization = "Bearer $($tokens["Admin"])" }

try {
    $yachts = Invoke-RestMethod -Uri "$BASE_URL/yachts" -Method Get -Headers $headers -TimeoutSec 5
    Write-Test -Label "GET /yachts (Admin)" -Status "PASS" -Details "Found $($yachts.data.Length) yachts"
} catch {
    Write-Test -Label "GET /yachts (Admin)" -Status "FAIL" -Details "Error: Unable to connect to server"
}

# ============================================================================
# 5. TEST YACHT SCOPE - Admin OUT OF SCOPE (debe ser 403)
# ============================================================================
Write-Section "Yacht Scope Security Tests"

# Test: Admin SIN acceso a yacht 2 -> debe retornar 403
Write-Host "`n[Security] Testing Admin OUT OF SCOPE (yacht 2)..." -ForegroundColor Yellow
$yachtId = 2  # Yacht al que Admin NO tiene acceso
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/engines?yachtId=$yachtId" -Method Get -Headers $headers -TimeoutSec 5
    Write-Test -Label "Admin OUT OF SCOPE (yacht 2)" -Status "FAIL" -Details "Should have returned 403"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 403) {
        Write-Test -Label "Admin OUT OF SCOPE (yacht 2)" -Status "PASS" -Details "Correctly blocked (403 Forbidden)"
    } else {
        Write-Test -Label "Admin OUT OF SCOPE (yacht 2)" -Status "FAIL" -Details "Got $status instead of 403"
    }
}

# ============================================================================
# 6. TEST YACHT SCOPE - SystemAdmin BYPASS (debe ser 200)
# ============================================================================
Write-Section "SystemAdmin Bypass Tests"

# Test: SystemAdmin SIN acceso a yacht 2 -> debe retornar 200 (bypass)
Write-Host "`n[Security] Testing SystemAdmin OUT OF SCOPE (yacht 2)..." -ForegroundColor Yellow
$sysAdminHeaders = @{ Authorization = "Bearer $($tokens["SystemAdmin"])" }
try {
    $engines = Invoke-RestMethod -Uri "$BASE_URL/engines?yachtId=2" -Method Get -Headers $sysAdminHeaders -TimeoutSec 5
    Write-Test -Label "SystemAdmin OUT OF SCOPE (yacht 2)" -Status "PASS" -Details "Bypass working (200 OK)"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Test -Label "SystemAdmin OUT OF SCOPE (yacht 2)" -Status "FAIL" -Details "Got $status instead of 200"
}

# ============================================================================
# 7. TEST YACHT ID OBLIGATORIO (debe ser 400)
# ============================================================================
Write-Section "Yacht ID Required Tests"

# Test: Captain SIN yachtId -> debe retornar 400
Write-Host "`n[Security] Testing Captain WITHOUT yachtId..." -ForegroundColor Yellow
$captainHeaders = @{ Authorization = "Bearer $($tokens["Captain"])" }
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/engines" -Method Get -Headers $captainHeaders -TimeoutSec 5
    Write-Test -Label "Captain WITHOUT yachtId" -Status "FAIL" -Details "Should have returned 400"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 400) {
        Write-Test -Label "Captain WITHOUT yachtId" -Status "PASS" -Details "Correctly rejected (400 Bad Request)"
    } else {
        Write-Test -Label "Captain WITHOUT yachtId" -Status "FAIL" -Details "Got $status instead of 400"
    }
}

# ============================================================================
# 8. TEST ENGINE CREATION (con yachtId en query)
# ============================================================================
Write-Section "Engine Management Tests"

$engineBody = @{
    name = "Test Engine QA"
    type = "Diesel"
    make = "Caterpillar"
    model = "C18"
    serialNumber = "CAT-C18-QA-001"
    hours = 1500
    status = "OK"
} | ConvertTo-Json

try {
    $headers = @{ Authorization = "Bearer $($tokens["Admin"])" }
    $engine = Invoke-RestMethod -Uri "$BASE_URL/yachts/1/engines" -Method Post -Body $engineBody -Headers $headers -ContentType "application/json" -TimeoutSec 5
    Write-Test -Label "POST /yachts/1/engines (Create)" -Status "PASS" -Details "Engine created: $($engine.id)"
    $createdEngineId = $engine.id
} catch {
    Write-Test -Label "POST /yachts/1/engines (Create)" -Status "FAIL" -Details "Error: Unable to connect to server"
}

# ============================================================================
# 9. TEST LIST ENGINES (con yachtId en query)
# ============================================================================
Write-Section "List Engines Tests"

try {
    $headers = @{ Authorization = "Bearer $($tokens["Admin"])" }
    $engines = Invoke-RestMethod -Uri "$BASE_URL/yachts/1/engines" -Method Get -Headers $headers -TimeoutSec 5
    Write-Test -Label "GET /yachts/1/engines (List)" -Status "PASS" -Details "Found $($engines.data.Length) engines"
} catch {
    Write-Test -Label "GET /yachts/1/engines (List)" -Status "FAIL" -Details "Error: Unable to connect to server"
}

# ============================================================================
# 10. TEST ACCESS CON DIFERENTES ROLES
# ============================================================================
Write-Section "Role-Based Access Tests"

# Test Captain access to yachts (should work for assigned yachts)
try {
    $headers = @{ Authorization = "Bearer $($tokens["Captain"])" }
    $yachts = Invoke-RestMethod -Uri "$BASE_URL/yachts" -Method Get -Headers $headers -TimeoutSec 5
    Write-Test -Label "GET /yachts (Captain)" -Status "PASS" -Details "Captain access to yachts list"
} catch {
    Write-Test -Label "GET /yachts (Captain)" -Status "FAIL" -Details "Error: Unable to connect to server"
}

# Test Engineer access
try {
    $headers = @{ Authorization = "Bearer $($tokens["Engineer"])" }
    $engines = Invoke-RestMethod -Uri "$BASE_URL/yachts/1/engines" -Method Get -Headers $headers -TimeoutSec 5
    Write-Test -Label "GET /yachts/1/engines (Engineer)" -Status "PASS" -Details "Engineer access to engines"
} catch {
    Write-Test -Label "GET /yachts/1/engines (Engineer)" -Status "FAIL" -Details "Error: Unable to connect to server"
}

# Test Steward access
try {
    $headers = @{ Authorization = "Bearer $($tokens["Steward"])" }
    $engines = Invoke-RestMethod -Uri "$BASE_URL/yachts/1/engines" -Method Get -Headers $headers -TimeoutSec 5
    Write-Test -Label "GET /yachts/1/engines (Steward)" -Status "PASS" -Details "Steward access to engines"
} catch {
    Write-Test -Label "GET /yachts/1/engines (Steward)" -Status "FAIL" -Details "Error: Unable to connect to server"
}

# ============================================================================
# 11. TEST ACCESS SIN TOKEN (debería fallar con 401)
# ============================================================================
Write-Section "Unauthorized Access Tests"

try {
    $yachts = Invoke-RestMethod -Uri "$BASE_URL/yachts" -Method Get -TimeoutSec 5
    Write-Test -Label "GET /yachts (No Token)" -Status "FAIL" -Details "Should have returned 401"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    if ($status -eq 401) {
        Write-Test -Label "GET /yachts (No Token)" -Status "PASS" -Details "Correctly returned 401 Unauthorized"
    } else {
        Write-Test -Label "GET /yachts (No Token)" -Status "FAIL" -Details "Got $status instead of 401"
    }
}

# ============================================================================
# RESUMEN FINAL
# ============================================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "[TEST] QA Smoke Tests Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`n[INFO] Test Users configured:" -ForegroundColor White
Write-Host "   - systemadmin@reinotierra.com / sysadmin123 (SystemAdmin - Bypass Total)" -ForegroundColor Gray
Write-Host "   - admin@reinotierra.com / admin123 (Admin - Yacht Access Required)" -ForegroundColor Gray
Write-Host "   - captain@reinotierra.com / captain123 (Captain - Yacht 1)" -ForegroundColor Gray
Write-Host "   - engineer@reinotierra.com / engineer123 (Engineer - Yacht 1)" -ForegroundColor Gray
Write-Host "   - steward@reinotierra.com / steward123 (Steward - Yacht 1)" -ForegroundColor Gray
Write-Host "`n[SECURITY] Security Tests:" -ForegroundColor White
Write-Host "   - Admin OUT OF SCOPE yacht -> 403 Forbidden" -ForegroundColor Gray
Write-Host "   - SystemAdmin OUT OF SCOPE yacht -> 200 OK (bypass)" -ForegroundColor Gray
Write-Host "   - Missing yachtId -> 400 Bad Request" -ForegroundColor Gray
Write-Host "   - Invalid refresh token -> 401 Unauthorized" -ForegroundColor Gray
Write-Host "`n[API] API Endpoints Tested:" -ForegroundColor White
Write-Host "   - GET  /health" -ForegroundColor Gray
Write-Host "   - POST /auth/login" -ForegroundColor Gray
Write-Host "   - POST /auth/refresh" -ForegroundColor Gray
Write-Host "   - GET  /yachts" -ForegroundColor Gray
Write-Host "   - GET  /yachts/:id/engines" -ForegroundColor Gray
Write-Host "   - POST /yachts/:id/engines" -ForegroundColor Gray
Write-Host "   - GET  /engines?yachtId=..." -ForegroundColor Gray
