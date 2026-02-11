# qa-smoke.ps1 - PMS Yacht Platform QA Smoke Tests
# Puerto: 3001
# Contrato de API verificado del controller real

$ErrorActionPreference = 'Stop'

# ============================================================================
# CONFIGURACIÓN
# ============================================================================
$BASE_URL = "http://localhost:3001"

# ============================================================================
# USUARIOS DE PRUEBA (del seed)
# ============================================================================
$USERS = @(
    @{ Email = "sysadmin@yachtpms.com"; Password = "sysadmin123"; Role = "SystemAdmin"; Description = "SystemAdmin - Bypass total" },
    @{ Email = "admin@yachtpms.com"; Password = "admin123"; Role = "Admin"; Description = "Admin - Requiere yacht access" },
    @{ Email = "captain@yachtpms.com"; Password = "captain123"; Role = "Captain"; Description = "Captain - Acceso yacht 1" },
    @{ Email = "engineer@yachtpms.com"; Password = "engineer123"; Role = "Engineer"; Description = "Engineer - Acceso yacht 1" },
    @{ Email = "steward@yachtpms.com"; Password = "steward123"; Role = "Steward"; Description = "Steward - Acceso yacht 1" }
)

# ============================================================================
# UTILIDADES
# ============================================================================
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

function Invoke-ApiRequest {
    param([string]$Method, [string]$Endpoint, [string]$Body = $null, [string]$Token = $null)
    
    $headers = @{"Content-Type" = "application/json"}
    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }
    
    $uri = "$BASE_URL$Endpoint"
    
    $restParams = @{
        Method = $Method
        Uri = $uri
        Headers = $headers
        UseBasicParsing = $true
        ErrorAction = "SilentlyContinue"
    }
    
    if ($Body) {
        $restParams["Body"] = $Body
    }
    
    return Invoke-WebRequest @restParams
}

function Parse-JsonResponse {
    param([string]$Content)
    try {
        return $Content | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Get-TokenFromLogin {
    param([object]$Login)
    # Intentar camelCase primero
    $token = $Login.accessToken
    if (-not $token) {
        # Fallback a snake_case
        $token = $Login.access_token
    }
    return $token
}

function Get-RefreshTokenFromLogin {
    param([object]$Login)
    # Intentar camelCase primero
    $refresh = $Login.refreshToken
    if (-not $refresh) {
        # Fallback a snake_case
        $refresh = $Login.refresh_token
    }
    return $refresh
}

# ============================================================================
# INICIO DE TESTS
# ============================================================================
Write-Host "[TEST] PMS Yacht Platform - QA Smoke Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Puerto: 3001" -ForegroundColor Gray

# ============================================================================
# 1. TEST HEALTH CHECK
# ============================================================================
Write-Section "Health Check"

try {
    $response = Invoke-ApiRequest -Method "GET" -Endpoint "/api/health"
    if ($response.StatusCode -eq 200) {
        $health = Parse-JsonResponse -Content $response.Content
        Write-Test -Label "GET /api/health" -Status "PASS" -Details "Status: $($health.status)"
    } else {
        Write-Test -Label "GET /api/health" -Status "FAIL" -Details "Status: $($response.StatusCode)"
    }
} catch {
    Write-Test -Label "GET /api/health" -Status "FAIL" -Details "Error: $($_.Exception.Message)"
}

# ============================================================================
# 2. TEST LOGIN CON DIFERENTES ROLES
# ============================================================================
Write-Section "Authentication - Login Tests"

$tokens = @{}

foreach ($user in $USERS) {
    $loginBody = "{`"email`":`"$($user.Email)`",`"password`":`"$($user.Password)`"}"
    
    try {
        $response = Invoke-ApiRequest -Method "POST" -Endpoint "/api/auth/login" -Body $loginBody
        if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 201) {
            $login = Parse-JsonResponse -Content $response.Content
            $tokens[$user.Role] = Get-TokenFromLogin -Login $login
            if ($user.Role -eq "Admin") {
                $global:REFRESH_TOKEN = Get-RefreshTokenFromLogin -Login $login
            }
            Write-Test -Label "POST /api/auth/login ($($user.Role))" -Status "PASS" -Details "Email: $($user.Email)"
        } else {
            Write-Test -Label "POST /api/auth/login ($($user.Role))" -Status "FAIL" -Details "Status: $($response.StatusCode)"
        }
    } catch {
        Write-Test -Label "POST /api/auth/login ($($user.Role))" -Status "FAIL" -Details "Error: $($_.Exception.Message)"
    }
}

# ============================================================================
# 3. TEST REFRESH TOKEN
# ============================================================================
Write-Section "Token Refresh"

# Test: Refresh token válido
if ($global:REFRESH_TOKEN) {
    $refreshBody = "{`"refreshToken`":`"$global:REFRESH_TOKEN`"}"
    
    try {
        $response = Invoke-ApiRequest -Method "POST" -Endpoint "/api/auth/refresh" -Body $refreshBody
        if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 201) {
            $refresh = Parse-JsonResponse -Content $response.Content
            $global:JWT_TOKEN = Get-TokenFromLogin -Login $refresh
            Write-Test -Label "POST /api/auth/refresh (valid)" -Status "PASS" -Details "Token refreshed successfully"
        } else {
            Write-Test -Label "POST /api/auth/refresh (valid)" -Status "FAIL" -Details "Got $($response.StatusCode)"
        }
    } catch {
        Write-Test -Label "POST /api/auth/refresh (valid)" -Status "FAIL" -Details "Error: $($_.Exception.Message)"
    }
}

# Test: Refresh token inválido -> debe retornar 401
Write-Host "`n[Security] Testing Invalid Refresh Token..." -ForegroundColor Yellow
$invalidRefreshBody = "{`"refreshToken`":`"invalid-token-12345`"}"

try {
    $response = Invoke-ApiRequest -Method "POST" -Endpoint "/api/auth/refresh" -Body $invalidRefreshBody
    Write-Test -Label "POST /api/auth/refresh (invalid)" -Status "FAIL" -Details "Should have returned 401"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    if ($status -eq 401) {
        Write-Test -Label "POST /api/auth/refresh (invalid)" -Status "PASS" -Details "Correctly rejected (401 Unauthorized)"
    } else {
        Write-Test -Label "POST /api/auth/refresh (invalid)" -Status "FAIL" -Details "Got $status instead of 401"
    }
}

# ============================================================================
# 4. TEST ENDPOINTS PROTEGIDOS - LISTA DE YACHTS
# ============================================================================
Write-Section "Protected Endpoints - Yachts List"

$yachtIds = @{}

# Test: Admin con acceso a yachts
if ($tokens.ContainsKey("Admin")) {
    $token = $tokens["Admin"]
    try {
        $response = Invoke-ApiRequest -Method "GET" -Endpoint "/api/yachts" -Token $token
        if ($response.StatusCode -eq 200) {
            $yachts = Parse-JsonResponse -Content $response.Content
            Write-Test -Label "GET /api/yachts (Admin)" -Status "PASS" -Details "Found $($yachts.Length) yachts"
            # Guardar yachts para pruebas de out-of-scope
            $global:ADMIN_YACHTS = $yachts
        } else {
            Write-Test -Label "GET /api/yachts (Admin)" -Status "FAIL" -Details "Got $($response.StatusCode)"
        }
    } catch {
        Write-Test -Label "GET /api/yachts (Admin)" -Status "FAIL" -Details "Error: $($_.Exception.Message)"
    }
}

# Test: Captain con acceso a yachts
if ($tokens.ContainsKey("Captain")) {
    $token = $tokens["Captain"]
    try {
        $response = Invoke-ApiRequest -Method "GET" -Endpoint "/api/yachts" -Token $token
        if ($response.StatusCode -eq 200) {
            $yachts = Parse-JsonResponse -Content $response.Content
            Write-Test -Label "GET /api/yachts (Captain)" -Status "PASS" -Details "Captain access to yachts list"
            # Guardar yachts para pruebas de out-of-scope
            $global:CAPTAIN_YACHTS = $yachts
        } else {
            Write-Test -Label "GET /api/yachts (Captain)" -Status "FAIL" -Details "Got $($response.StatusCode)"
        }
    } catch {
        Write-Test -Label "GET /api/yachts (Captain)" -Status "FAIL" -Details "Error: $($_.Exception.Message)"
    }
}

# ============================================================================
# 5. TEST YACHT ID OBLIGATORIO - ENGINES (debe ser 400)
# ============================================================================
Write-Section "Yacht ID Required Tests"

# Test: Captain SIN yachtId en query -> debe retornar 400
Write-Host "`n[Security] Testing Captain WITHOUT yachtId (engines)..." -ForegroundColor Yellow
if ($tokens.ContainsKey("Captain")) {
    $token = $tokens["Captain"]
    try {
        $response = Invoke-ApiRequest -Method "GET" -Endpoint "/api/engines" -Token $token
        Write-Test -Label "Captain WITHOUT yachtId (engines)" -Status "FAIL" -Details "Should have returned 400"
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        if ($status -eq 400) {
            Write-Test -Label "Captain WITHOUT yachtId (engines)" -Status "PASS" -Details "Correctly rejected (400 Bad Request)"
        } else {
            Write-Test -Label "Captain WITHOUT yachtId (engines)" -Status "FAIL" -Details "Got $status instead of 400"
        }
    }
}

# ============================================================================
# 6. TEST YACHT SCOPE - OUT OF SCOPE (debe ser 403)
# ============================================================================
Write-Section "Yacht Scope Security Tests"

# Test: Captain SIN acceso a yacht "OutOfScope" -> debe retornar 403
Write-Host "`n[Security] Testing Captain OUT OF SCOPE..." -ForegroundColor Yellow
if ($tokens.ContainsKey("Captain") -and $global:CAPTAIN_YACHTS -and $global:ADMIN_YACHTS) {
    $token = $tokens["Captain"]
    $captainYachtIds = $global:CAPTAIN_YACHTS.id
    # Buscar un yacht que el Captain NO tiene pero que existe (de los que ve el Admin)
    $outOfScopeYachtId = $null
    foreach ($adminYacht in $global:ADMIN_YACHTS) {
        if ($captainYachtIds -notcontains $adminYacht.id) {
            $outOfScopeYachtId = $adminYacht.id
            break
        }
    }
    
    if ($outOfScopeYachtId) {
        try {
            $response = Invoke-ApiRequest -Method "GET" -Endpoint "/api/engines?yachtId=$($outOfScopeYachtId)" -Token $token
            Write-Test -Label "Captain OUT OF SCOPE" -Status "FAIL" -Details "Should have returned 403"
        } catch {
            $status = [int]$_.Exception.Response.StatusCode
            if ($status -eq 403) {
                Write-Test -Label "Captain OUT OF SCOPE (yachtId=$($outOfScopeYachtId.Substring(0,8))...)" -Status "PASS" -Details "Correctly blocked (403 Forbidden)"
            } else {
                Write-Test -Label "Captain OUT OF SCOPE" -Status "FAIL" -Details "Got $status instead of 403"
            }
        }
    } else {
        Write-Test -Label "Captain OUT OF SCOPE" -Status "INFO" -Details "No out-of-scope yacht found for Captain"
    }
}

# ============================================================================
# 7. TEST SYSTEMADMIN BYPASS (debe ser 200)
# ============================================================================
Write-Section "SystemAdmin Bypass Tests"

# Test: SystemAdmin SIN acceso a yacht "OutOfScope" -> debe retornar 200 (bypass)
Write-Host "`n[Security] Testing SystemAdmin OUT OF SCOPE (bypass)..." -ForegroundColor Yellow
if ($tokens.ContainsKey("SystemAdmin")) {
    $token = $tokens["SystemAdmin"]
    # SystemAdmin puede acceder a cualquier yacht, usamos uno de los de Admin
    $outOfScopeYachtId = $null
    if ($global:ADMIN_YACHTS -and $global:ADMIN_YACHTS.Length -gt 0) {
        $outOfScopeYachtId = $global:ADMIN_YACHTS[0].id
    } else {
        # Fallback a un UUID conocido
        $outOfScopeYachtId = "e7c4b3ce-cea9-4127-bbe4-2d092de3cbff"
    }
    try {
        $response = Invoke-ApiRequest -Method "GET" -Endpoint "/api/engines?yachtId=$($outOfScopeYachtId)" -Token $token
        if ($response.StatusCode -eq 200) {
            Write-Test -Label "SystemAdmin OUT OF SCOPE (yachtId=$($outOfScopeYachtId.Substring(0,8))...)" -Status "PASS" -Details "Bypass working (200 OK)"
        } else {
            Write-Test -Label "SystemAdmin OUT OF SCOPE" -Status "FAIL" -Details "Got $($response.StatusCode) instead of 200"
        }
    } catch {
        Write-Test -Label "SystemAdmin OUT OF SCOPE" -Status "FAIL" -Details "Error: $($_.Exception.Message)"
    }
}

# ============================================================================
# 8. TEST ENGINE MANAGEMENT
# ============================================================================
Write-Section "Engine Management Tests"

# Test: GET engines con yachtId válido (Captain en Demo Yacht)
Write-Host "`n[Info] Testing GET /api/engines?yachtId=..." -ForegroundColor Yellow
if ($tokens.ContainsKey("Captain") -and $global:CAPTAIN_YACHTS) {
    $token = $tokens["Captain"]
    $demoYachtId = $global:CAPTAIN_YACHTS[0].id
    try {
        $response = Invoke-ApiRequest -Method "GET" -Endpoint "/api/engines?yachtId=$($demoYachtId)" -Token $token
        if ($response.StatusCode -eq 200) {
            $engines = Parse-JsonResponse -Content $response.Content
            Write-Test -Label "GET /api/engines?yachtId (Captain)" -Status "PASS" -Details "Found $($engines.Length) engines"
        } else {
            Write-Test -Label "GET /api/engines?yachtId (Captain)" -Status "FAIL" -Details "Got $($response.StatusCode)"
        }
    } catch {
        Write-Test -Label "GET /api/engines?yachtId (Captain)" -Status "FAIL" -Details "Error: $($_.Exception.Message)"
    }
}

# Test: POST create engine con yachtId en body
Write-Host "`n[Info] Testing POST /api/engines..." -ForegroundColor Yellow
if ($tokens.ContainsKey("Captain") -and $global:CAPTAIN_YACHTS) {
    $token = $tokens["Captain"]
    $demoYachtId = $global:CAPTAIN_YACHTS[0].id
    $engineBody = "{`"yachtId`":`"$($demoYachtId)`",`"name`":`"Test Engine QA`",`"type`":`"Diesel`",`"serialNo`":`"CAT-C18-QA-001`"}"
    try {
        $response = Invoke-ApiRequest -Method "POST" -Endpoint "/api/engines" -Body $engineBody -Token $token
        if ($response.StatusCode -eq 201) {
            $engine = Parse-JsonResponse -Content $response.Content
            Write-Test -Label "POST /api/engines (Create)" -Status "PASS" -Details "Engine created: $($engine.id)"
            $global:CREATED_ENGINE_ID = $engine.id
        } else {
            Write-Test -Label "POST /api/engines (Create)" -Status "FAIL" -Details "Got $($response.StatusCode)"
        }
    } catch {
        Write-Test -Label "POST /api/engines (Create)" -Status "FAIL" -Details "Error: $($_.Exception.Message)"
    }
}

# ============================================================================
# 9. TEST ADMIN OUT OF SCOPE (debe ser 403)
# ============================================================================
Write-Section "Admin Out of Scope Test"

# Test: Admin SIN acceso a yacht "OutOfScope" -> debe retornar 403
Write-Host "`n[Security] Testing Admin OUT OF SCOPE..." -ForegroundColor Yellow
if ($tokens.ContainsKey("Admin") -and $global:ADMIN_YACHTS) {
    $token = $tokens["Admin"]
    # Admin tiene acceso a todos los yachts en su lista, así que usamos un yacht que no existe
    $fakeOutOfScopeId = "00000000-0000-0000-0000-000000000000"
    try {
        $response = Invoke-ApiRequest -Method "GET" -Endpoint "/api/engines?yachtId=$($fakeOutOfScopeId)" -Token $token
        Write-Test -Label "Admin OUT OF SCOPE" -Status "FAIL" -Details "Should have returned 403"
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        if ($status -eq 403) {
            Write-Test -Label "Admin OUT OF SCOPE" -Status "PASS" -Details "Correctly blocked (403 Forbidden)"
        } else {
            Write-Test -Label "Admin OUT OF SCOPE" -Status "FAIL" -Details "Got $status instead of 403"
        }
    }
}

# ============================================================================
# 10. TEST ACCESS SIN TOKEN (debería fallar con 401)
# ============================================================================
Write-Section "Unauthorized Access Tests"

# Test: GET yachts SIN token -> debe retornar 401
try {
    $response = Invoke-ApiRequest -Method "GET" -Endpoint "/api/yachts"
    Write-Test -Label "GET /api/yachts (No Token)" -Status "FAIL" -Details "Should have returned 401"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    if ($status -eq 401) {
        Write-Test -Label "GET /api/yachts (No Token)" -Status "PASS" -Details "Correctly returned 401 Unauthorized"
    } else {
        Write-Test -Label "GET /api/yachts (No Token)" -Status "FAIL" -Details "Got $status instead of 401"
    }
}

# ============================================================================
# RESUMEN FINAL
# ============================================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "[TEST] QA Smoke Tests Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`n[INFO] Test Users configured:" -ForegroundColor White
Write-Host "   - sysadmin@yachtpms.com / sysadmin123 (SystemAdmin - Bypass Total)" -ForegroundColor Gray
Write-Host "   - admin@yachtpms.com / admin123 (Admin - Yacht Access Required)" -ForegroundColor Gray
Write-Host "   - captain@yachtpms.com / captain123 (Captain - Demo Yacht)" -ForegroundColor Gray
Write-Host "   - engineer@yachtpms.com / engineer123 (Engineer - Demo Yacht)" -ForegroundColor Gray
Write-Host "   - steward@yachtpms.com / steward123 (Steward - Demo Yacht)" -ForegroundColor Gray
Write-Host "`n[SECURITY] Security Tests:" -ForegroundColor White
Write-Host "   - Missing yachtId -> 400 Bad Request" -ForegroundColor Gray
Write-Host "   - Admin OUT OF SCOPE yacht -> 403 Forbidden" -ForegroundColor Gray
Write-Host "   - Captain OUT OF SCOPE yacht -> 403 Forbidden" -ForegroundColor Gray
Write-Host "   - SystemAdmin OUT OF SCOPE yacht -> 200 OK (bypass)" -ForegroundColor Gray
Write-Host "   - Invalid refresh token -> 401 Unauthorized" -ForegroundColor Gray
Write-Host "   - No Token -> 401 Unauthorized" -ForegroundColor Gray
Write-Host "`n[API] API Endpoints Tested:" -ForegroundColor White
Write-Host '   - GET  /api/health' -ForegroundColor Gray
Write-Host '   - POST /api/auth/login' -ForegroundColor Gray
Write-Host '   - POST /api/auth/refresh' -ForegroundColor Gray
Write-Host '   - GET  /api/yachts' -ForegroundColor Gray
Write-Host '   - GET  /api/engines?yachtId=...' -ForegroundColor Gray
Write-Host '   - POST /api/engines' -ForegroundColor Gray
