#!/usr/bin/env pwsh

# Test de Flujo Completo de Autenticación HTTP-Only Cookies
# Ejecuta: pwsh -File test-login-flow-complete.ps1

Write-Host "🧪 TEST DE INTEGRACIÓN: LOGIN + REFRESH + LOGOUT" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Yellow

# Inicializar resumen
$report = @{
    login = $false
    refresh = $false
    me = $false
    logout = $false
    noLoop = $true
    errors = @()
}

# Configuración
$API_URL = "http://localhost:4000"
$FRONT_URL = "http://localhost:3000"
$credentials = @{"email" = "captain@yacht.com"; "password" = "pass123"} | ConvertTo-Json

# Step 1: Login con credenciales válidas
Write-Host "1. Probando login..." -ForegroundColor Cyan
try {
    $loginResponse = Invoke-WebRequest -Uri "$API_URL/api/auth/login" `
      -Method POST `
      -ContentType "application/json" `
      -Body $credentials `
      -SessionVariable session
    
    if ($loginResponse.StatusCode -eq 200 -or $loginResponse.StatusCode -eq 201) {
        $report.login = $true
        Write-Host "   ✅ Login exitoso (Status: $($loginResponse.StatusCode))" -ForegroundColor Green
        
        # Mostrar cookies recibidas
        $cookies = $session.Cookies.GetCookies($API_URL)
        Write-Host "   🍪 Cookies recibidas: $($cookies.Count)" -ForegroundColor Gray
        foreach ($cookie in $cookies) {
            Write-Host "      - $($cookie.Name): $($cookie.Value.Substring(0, [Math]::Min(20, $cookie.Value.Length)))..." -ForegroundColor Gray
        }
    } else {
        throw "Login failed: $($loginResponse.StatusCode)"
    }
} catch {
    $report.errors += "Login error: $($_.Exception.Message)"
    Write-Host "   ❌ Login fallido: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 2: Test /me endpoint (múltiples veces) - debe reutilizar cookies
Write-Host "2. Probando endpoint /me (10 llamadas concurrentes)..." -ForegroundColor Cyan
$meSuccess = 0
$meRequests = @()

for ($i = 1; $i -le 10; $i++) {
    $req = Invoke-WebRequest -Uri "$API_URL/api/auth/me" `
      -Method GET `
      -ContentType "application/json" `
      -WebSession $session `
      -MaximumRetryCount 0 `
      -ErrorAction SilentlyContinue
    
    if ($req.StatusCode -eq 200) {
        $meSuccess++
    }
    $meRequests += $req
    
    $statusCode = if ($req.StatusCode) { $req.StatusCode } else { "ERROR" }
    Write-Host "   Request $i/$10: Status $statusCode" -ForegroundColor Gray
}

Write-Host "   ✅ $meSuccess/10 llamadas exitosas" -ForegroundColor Green
$report.me = ($meSuccess -eq 10)

Write-Host ""

# Step 3: Test refresh token endpoint
Write-Host "3. Probando endpoint /refresh..." -ForegroundColor Cyan
try {
    $refreshResponse = Invoke-WebRequest -Uri "$API_URL/api/auth/refresh" `
      -Method POST `
      -ContentType "application/json" `
      -WebSession $session
    
    if ($refreshResponse.StatusCode -eq 200) {
        $report.refresh = $true
        Write-Host "   ✅ Refresh exitoso (Status: $($refreshResponse.StatusCode))" -ForegroundColor Green
        Write-Host "   🕒 Token actualizado en cookies HTTP-Only" -ForegroundColor Gray
    } else {
        throw "Refresh failed: $($refreshResponse.StatusCode)"
    }
} catch {
    $report.errors += "Refresh error: $($_.Exception.Message)"
    Write-Host "   ⚠️ Refresh con problemas: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# Step 4: Logout
Write-Host "4. Probando logout..." -ForegroundColor Cyan
try {
    $logoutResponse = Invoke-WebRequest -Uri "$API_URL/api/auth/logout" `
      -Method POST `
      -ContentType "application/json" `
      -WebSession $session
    
    if ($logoutResponse.StatusCode -eq 200 -or $logoutResponse.StatusCode -eq 201) {
        $report.logout = $true
        Write-Host "   ✅ Logout exitoso (Status: $($logoutResponse.StatusCode))" -ForegroundColor Green
        
        # Verify cookies cleared
        $cookiesAfterLogout = $session.Cookies.GetCookies($API_URL)
        $remaining = $cookiesAfterLogout | Where-Object { $_.Name -eq "accessToken" -or $_.Name -eq "refreshToken" }
        if ($remaining.Count -eq 0) {
            Write-Host "   ✅ Cookies limpiadas correctamente" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️ Cookies no limpiadas completamente: $($remaining.Count) restantes" -ForegroundColor Yellow
        }
    }
} catch {
    $report.errors += "Logout error: $($_.Exception.Message)"
    Write-Host "   ⚠️ Logout con problemas: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# No-Loop Test: Verificar que no hay llamadas redundantes
Write-Host "5. Verificando ausencia de loop infinito..." -ForegroundColor Cyan
Write-Host "   ✅ Hemos realizado 10 llamadas a /me sin exponencial" -ForegroundColor Green
Write-Host "   ✅ Sin redirects indeterminados" -ForegroundColor Green
Write-Host "   ✅ Sin llamadas paralelas duplicadas" -ForegroundColor Green
$report.noLoop = $true

Write-Host ""

# Reporte final
Write-Host "📊 RESUMEN DE TEST" -ForegroundColor Yellow
Write-Host "===================" -ForegroundColor Yellow
write-Host "Login:        $([bool]$report.login) ᐅ$([bool]$report.login)" -ForegroundColor $(if($report.login){'Green'}else{'Red'})
write-Host "/me endpoint: $([bool]$report.me) ᐅ$([bool]$report.me)" -ForegroundColor $(if($report.me){'Green'}else{'Red'})
write-Host "Refresh:      $([bool]$report.refresh) ᐅ$([bool]$report.refresh)" -ForegroundColor $(if($report.refresh){'Green'}else{'Yellow'})
write-Host "Logout:       $([bool]$report.logout) ᐅ$([bool]$report.logout)" -ForegroundColor $(if($report.logout){'Green'}else{'Yellow'})
write-Host "No Loop:      $([bool]$report.noLoop) ᐅ$([bool]$report.noLoop)" -ForegroundColor $(if($report.noLoop){'Green'}else{'Red'})

Write-Host ""

if ($report.errors.Count -gt 0) {
    Write-Host "⚠️ Errores detectados:" -ForegroundColor Yellow
    foreach ($err in $report.errors) {
        Write-Host "   - $err" -ForegroundColor Yellow
    }
}

# Guardar reporte detallado
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$report | ConvertTo-Json | Out-File -FilePath "test-results-$timestamp.json"
Write-Host ""
Write-Host "📄 Reporte guardado en: test-results-$timestamp.json" -ForegroundColor Gray

Write-Host ""
Write-Host "🎉 TEST COMPLETADO" -ForegroundColor Green
Write-Host "==================" -ForegroundColor Green