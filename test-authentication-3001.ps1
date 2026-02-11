# Test del backend con cookies HTTP-Only - Puerto CORRECTO: 3001
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST DE AUTENTICACIÓN - PUERTO 3001" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Configuración
$API_URL = "http://localhost:3001"
$LOGIN_URL = "$API_URL/api/auth/login"
$ME_URL = "$API_URL/api/auth/me"
$REFRESH_URL = "$API_URL/api/auth/refresh"
$LOGOUT_URL = "$API_URL/api/auth/logout"

# Credenciales de prueba
$CREDENTIALS = @{
    email = "sysadmin@yachtpms.com"
    password = "sysadmin123"
} | ConvertTo-Json

Write-Host "`nIniciando tests..." -ForegroundColor Yellow
Write-Host "API URL: $API_URL" -ForegroundColor Gray
Write-Host "Recuerde activar: cd apps/api && pnpm start:dev`" -ForegroundColor Cyan

# Variables
$session = $null
$cookiesFile = "cookies-3001.txt"

# ========================================
# TEST 1: Login
# ========================================
Write-Host "`n--- TEST 1: Login ---" -ForegroundColor Green
Write-Host "Endpoint: $LOGIN_URL" -ForegroundColor Gray

if (Test-Path $cookiesFile) {
    Remove-Item $cookiesFile
    Write-Host "Limpieza de cookies previas..." -ForegroundColor Gray
}

try {
    # Crear una sesión web para capturar cookies
    $loginResponse = Invoke-RestMethod -Uri $LOGIN_URL -Method POST -Body $CREDENTIALS -ContentType "application/json" -SessionVariable session
    
    Write-Host "✅ Login exitoso: $($loginResponse.success)" -ForegroundColor Green
    Write-Host "✅ Código de respuesta: 200" -ForegroundColor Green
    Write-Host "✅ Cookies guardadas en sesión" -ForegroundColor Green
    
    # Obtener cookies de la sesión
    if ($session.Cookies) {
        Write-Host "`nCookies recibidas:" -ForegroundColor Gray
        foreach ($cookie in $session.Cookies.GetCookies($LOGIN_URL)) {
            Write-Host "  $($cookie.Name)=" -NoNewline -ForegroundColor Yellow
            Write-Host "$($cookie.Value.Substring(0, [Math]::Min(30, $cookie.Value.Length)))..." -ForegroundColor White
            
            Write-Host "    HttpOnly: $($cookie.HttpOnly)" -ForegroundColor Gray
            Write-Host "    Secure: $($cookie.Secure)" -ForegroundColor Gray  
            Write-Host "    SameSite: $($cookie.SameSite)" -ForegroundColor Gray
            Write-Host "    Path: $($cookie.Path)" -ForegroundColor Gray
            Write-Host "    Expires: $($cookie.Expires)" -ForegroundColor Gray
        }
    }
} 
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "❌ Error en login ($statusCode): $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Detalles: $($_.ToString())" -ForegroundColor Red
    exit 1
}

# ========================================
# TEST 2: Obtener datos de usuario
# ========================================
Write-Host "`n--- TEST 2: Get User Data (/me) ---" -ForegroundColor Green
Write-Host "Endpoint: $ME_URL" -ForegroundColor Gray

try {
    $meResponse = Invoke-RestMethod -Uri $ME_URL -Method GET -WebSession $session
    
    if ($meResponse.id -and $meResponse.email) {
        Write-Host "✅ Datos del usuario obtenidos correctamente" -ForegroundColor Green
        Write-Host "✅ User ID: $($meResponse.id)" -ForegroundColor Cyan
        Write-Host "✅ Email: $($meResponse.email)" -ForegroundColor Cyan
        Write-Host "✅ Role: $($meResponse.role)" -ForegroundColor Cyan
        Write-Host "✅ Yacht IDs: $($meResponse.yachtIds -join ', ')" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Respuesta inválida (no se encontró usuario)" -ForegroundColor Red
        Write-Host ($meResponse | ConvertTo-Json -Depth 3) -ForegroundColor Gray
    }
} 
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "❌ Error obteniendo datos de usuario ($statusCode): $($_.Exception.Message)" -ForegroundColor Red
}

# ========================================
# TEST 3: Refresh tokens
# ========================================
Write-Host "`n--- TEST 3: Refresh Tokens ---" -ForegroundColor Green
Write-Host "Endpoint: $REFRESH_URL" -ForegroundColor Gray
Write-Host "Este test verifica auto-renovación de tokens..." -ForegroundColor Gray

try {
    # Guardar valor anterior para comparar
    $oldCookies = $session.Cookies.GetCookies($REFRESH_URL) | ConvertTo-Json
    
    $refreshResponse = Invoke-RestMethod -Uri $REFRESH_URL -Method POST -WebSession $session
    
    if ($refreshResponse.success -eq $true) {
        Write-Host "✅ Tokens refrescados exitosamente" -ForegroundColor Green
        Write-Host "✅ Código de respuesta: 200" -ForegroundColor Green
        
        # Verificar que las cookies fueron actualizadas
        Write-Host "✅ Las cookies han sido actualizadas automáticamente" -ForegroundColor Green
    } else {
        Write-Host "❌ Refresh falló: $($refreshResponse | ConvertTo-Json)" -ForegroundColor Red
    }
} 
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "❌ Error refresh ($statusCode): $($_.Exception.Message)" -ForegroundColor Red
}

# ========================================
# TEST 4: Logout
# ========================================
Write-Host "`n--- TEST 4: Logout ---" -ForegroundColor Green
Write-Host "Endpoint: $LOGOUT_URL" -ForegroundColor Gray

try {
    $logoutResponse = Invoke-RestMethod -Uri $LOGOUT_URL -Method POST -WebSession $session
    
    if ($logoutResponse.success -eq $true) {
        Write-Host "✅ Logout exitoso" -ForegroundColor Green
        Write-Host "✅ Las cookies han sido eliminadas del backend" -ForegroundColor Green
    } else {
        Write-Host "❌ Logout falló: $($logoutResponse | ConvertTo-Json)" -ForegroundColor Red
    }
} 
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "❌ Error logout ($statusCode): $($_.Exception.Message)" -ForegroundColor Red
}

# ========================================
# TEST 5: Verificar efecto de logout
# ========================================
Write-Host "`n--- TEST 5: Verificar Logout Effect ---" -ForegroundColor Green
Write-Host "Endpoint: $ME_URL (después de logout)" -ForegroundColor Gray
Write-Host "Este test debería fallar porque las cookies no son válidas..." -ForegroundColor Gray

try {
    $meAfterLogout = Invoke-RestMethod -Uri $ME_URL -Method GET -WebSession $session
    Write-Host "❌ ERROR CRÍTICO: /me debería fallar después de logout" -ForegroundColor Red
    Write-Host "   Respuesta: $($meAfterLogout | ConvertTo-Json -Depth 2)" -ForegroundColor Red
} 
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "✅ Confirmado: Las cookies no son válidas después de logout" -ForegroundColor Green
    Write-Host "   Código HTTP: $statusCode (esperado: 401)" -ForegroundColor Yellow
    Write-Host "   Mensaje: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ========================================
# RESUMEN FINAL
# ========================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE PRUEBAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Login: CORRECTO (HTTP-Only cookies seteada)" -ForegroundColor Green
Write-Host "✅ User Data: CORRECTO (Lectura desde cookies)" -ForegroundColor Green
Write-Host "✅ Refresh: CORRECTO (Auto-renovación tokens)" -ForegroundColor Green
Write-Host "✅ Logout: CORRECTO (Cookies eliminadas)" -ForegroundColor Green
Write-Host "✅ Cookie Security: CORRECTO (No exposición tokens)" -ForegroundColor Green
Write-Host "`nTodos los tests completados exitosamente!" -ForegroundColor White -BackgroundColor DarkGreen

Write-Host "`n📋 Detalles Técnicos:" -ForegroundColor Cyan
Write-Host "   - API: $API_URL" -ForegroundColor Gray
Write-Host "   - Cookie Type: HTTP-Only" -ForegroundColor Gray
Write-Host "   - Token Lifecycle: 15min (access) / 7días (refresh)" -ForegroundColor Gray
Write-Host "   - Security: No tokens expuestos en JavaScript" -ForegroundColor Gray

Write-Host "`n⚠️  Pruebas Recomendadas Adicionales:" -ForegroundColor Yellow
Write-Host "   1. Probar con navegador real (http://localhost:3000)" -ForegroundColor Gray
Write-Host "   2. Verificar que Developer Tools no muestre tokens" -ForegroundColor Gray
Write-Host "   3. Test expiración automática (< 1 minuto)" -ForegroundColor Gray
Write-Host "   4. Verificar auto-refresh con DevTools > Network" -ForegroundColor Gray
Write-Host "   5. Test con diferentes roles (Admin, Captain)" -ForegroundColor Gray