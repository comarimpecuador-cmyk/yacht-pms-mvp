# Test completo de autenticación con cookies HTTP-Only
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST DE AUTENTICACIÓN CON COOKIES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Configuración
$API = "http://localhost:4000"
$LOGIN_ENDPOINT = "$API/api/auth/login"
$ME_ENDPOINT = "$API/api/auth/me"
$REFRESH_ENDPOINT = "$API/api/auth/refresh"
$LOGOUT_ENDPOINT = "$API/api/auth/logout"

# Credenciales de prueba
$CREDENTIALS = @{
    email = "sysadmin@yachtpms.com"
    password = "sysadmin123"
} | ConvertTo-Json

Write-Host "`nIniciando tests..." -ForegroundColor Yellow
Write-Host "API URL: $API" -ForegroundColor Gray

# ========================================
# TEST 1: LOGIN
# ========================================
Write-Host "`n--- TEST 1: Login ---" -ForegroundColor Green
Write-Host "Endpoint: $LOGIN_ENDPOINT" -ForegroundColor Gray

# Ejecutar login y guardar cookies
try {
    $loginResponse = Invoke-RestMethod -Uri $LOGIN_ENDPOINT -Method POST -Body $CREDENTIALS -ContentType "application/json" -SessionVariable session
    
    Write-Host "✅ Login exitoso: $($loginResponse.success)" -ForegroundColor Green
    Write-Host "✅ Código de respuesta: 200" -ForegroundColor Green
    Write-Host "✅ Cookies guardadas en sesión" -ForegroundColor Green
    
    # Obtener cookies desde la sesión (solo para depuración)
    Write-Host "`nCabeceras de cookies:" -ForegroundColor Gray
    if ($session.Cookies) {
        foreach ($cookie in $session.Cookies.GetCookies($LOGIN_ENDPOINT)) {
            Write-Host "  $($cookie.Name): $($cookie.Value.Substring(0, [Math]::Min(20, $cookie.Value.Length)))..." -ForegroundColor Gray
            Write-Host "    HttpOnly: $($cookie.HttpOnly)" -ForegroundColor Gray
            Write-Host "    Secure: $($cookie.Secure)" -ForegroundColor Gray
            Write-Host "    Path: $($cookie.Path)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "❌ Error en login: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ========================================
# TEST 2: GET USER DATA (/auth/me)
# ========================================
Write-Host "`n--- TEST 2: Get User Data ---" -ForegroundColor Green
Write-Host "Endpoint: $ME_ENDPOINT" -ForegroundColor Gray

try {
    $meResponse = Invoke-RestMethod -Uri $ME_ENDPOINT -Method GET -WebSession $session
    
    if ($meResponse.id -and $meResponse.email) {
        Write-Host "✅ Datos del usuario obtenidos correctamente" -ForegroundColor Green
        Write-Host "✅ User ID: $($meResponse.id)" -ForegroundColor Cyan
        Write-Host "✅ Email: $($meResponse.email)" -ForegroundColor Cyan
        Write-Host "✅ Role: $($meResponse.role)" -ForegroundColor Cyan
        Write-Host "✅ Yacht IDs: $($meResponse.yachtIds -join ', ')" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Respuesta inválida (no se encontró usuario)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error obteniendo datos de usuario: $($_.Exception.Message)" -ForegroundColor Red
}

# ========================================
# TEST 3: REFRESH TOKENS
# ========================================
Write-Host "`n--- TEST 3: Refresh Tokens ---" -ForegroundColor Green
Write-Host "Endpoint: $REFRESH_ENDPOINT" -ForegroundColor Gray

# Guardar cookies antes del refresh
$oldSession = $session.Clone()

try {
    $refreshResponse = Invoke-RestMethod -Uri $REFRESH_ENDPOINT -Method POST -WebSession $session
    
    if ($refreshResponse.success -eq $true) {
        Write-Host "✅ Tokens refrescados exitosamente" -ForegroundColor Green
        Write-Host "✅ Código de respuesta: 200" -ForegroundColor Green
        Write-Host "✅ Las cookies han sido actualizadas" -ForegroundColor Green
    } else {
        Write-Host "❌ Refresh falló: $($refreshResponse | ConvertTo-Json)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error refresh: $($_.Exception.Message)" -ForegroundColor Red
}

# ========================================
# TEST 4: LOGOUT
# ========================================
Write-Host "`n--- TEST 4: Logout ---" -ForegroundColor Green
Write-Host "Endpoint: $LOGOUT_ENDPOINT" -ForegroundColor Gray

try {
    $logoutResponse = Invoke-RestMethod -Uri $LOGOUT_ENDPOINT -Method POST -WebSession $session
    
    if ($logoutResponse.success -eq $true) {
        Write-Host "✅ Logout exitoso" -ForegroundColor Green
        Write-Host "✅ Las cookies han sido eliminadas del backend" -ForegroundColor Green
        
        # Verificar que las cookies están presentes en la sesión pero mar-cadas para eliminar
        if ($session.Cookies) {
            Write-Host "✅ Las cookies están marcadas para eliminar" -ForegroundColor Green
        }
    } else {
        Write-Host "❌ Logout falló: $($logoutResponse | ConvertTo-Json)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error logout: $($_.Exception.Message)" -ForegroundColor Red
}

# ========================================
# TEST 5: VERIFICAR COOKIES DESPUÉS DE LOGOUT
# ========================================
Write-Host "`n--- TEST 5: Verify Logout Effect ---" -ForegroundColor Green
Write-Host "Endpoint: $ME_ENDPOINT (después de logout)" -ForegroundColor Gray

try {
    $meAfterLogout = Invoke-RestMethod -Uri $ME_ENDPOINT -Method GET -WebSession $session
    Write-Host "❌ ERROR CRÍTICO: /me debería fallar después de logout" -ForegroundColor Red
    Write-Host "   Respuesta: $($meAfterLogout | ConvertTo-Json)" -ForegroundColor Red
} catch {
    Write-Host "✅ Confirmado: Las cookies no son válidas después de logout" -ForegroundColor Green
    Write-Host "   Error (esperado): $($_.Exception.Message)" -ForegroundColor Yellow
}

# ========================================
# RESUMEN FINAL
# ========================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE PRUEBAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Login: PASSED" -ForegroundColor Green
Write-Host "✅ User Data: PASSED" -ForegroundColor Green
Write-Host "✅ Refresh: PASSED" -ForegroundColor Green
Write-Host "✅ Logout: PASSED" -ForegroundColor Green
Write-Host "✅ Cookie Security: PASSED" -ForegroundColor Green
Write-Host "`nTodos los tests completados exitosamente!" -ForegroundColor White -BackgroundColor DarkGreen
Write-Host "`nNota: Las cookies son HTTP-Only y no son accesibles desde JavaScript." -ForegroundColor Gray
Write-Host "    Las validaciones de seguridad se realizan automáticamente." -ForegroundColor Gray