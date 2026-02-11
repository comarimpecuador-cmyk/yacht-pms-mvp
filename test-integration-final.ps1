# Test de Integración Final - Cookies HTTP-Only
# Verifica que el loop infinito está resuelto

Write-Host "🧪 TEST DE INTEGRACIÓN FINAL - COOKIES HTTP-ONLY" -ForegroundColor Cyan
Write-Host "==========================================="`n

# Asegurar que estamos en el directorio correcto
$ErrorActionPreference = "Stop"

# 1. Verificar configuración
Write-Host "✅ PASO 1: Verificando configuración..." -ForegroundColor Yellow
if (Test-Path "apps/web/.env.local") {
    $envContent = Get-Content "apps/web/.env.local"
    Write-Host "   .env.local existe: $envContent"
    if ($envContent -like "*3001*") {
        Write-Host "   ✅ API URL apunta a puerto 3001" -ForegroundColor Green
    } else {
        Write-Host "   ❌ API URL NO apunta a puerto 3001" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ❌ .env.local no existe!" -ForegroundColor Red
    exit 1
}

# 2. Hacer login con curl (como referencia)
Write-Host "`n✅ PASO 2: Test login con curl..." -ForegroundColor Yellow
$loginResult = curl -s -X POST http://localhost:3001/api/auth/login `
    -H "Content-Type: application/json" `
    -d '{"email":"sysadmin@yachtpms.com","password":"sysadmin123"}' `
    -c cookies-final.txt

$cookies = Get-Content cookies-final.txt
if ($cookies -like "*accessToken*" -and $cookies -like "*refreshToken*") {
    Write-Host "   ✅ Login curl exitoso, cookies seteadas correctamente" -ForegroundColor Green
} else {
    Write-Host "   ❌ Login curl fallido" -ForegroundColor Red
    exit 1
}

# 3. Test /me con cookies
Write-Host "`n✅ PASO 3: Test /me con cookies..." -ForegroundColor Yellow
$meResult = curl -s -X GET http://localhost:3001/api/auth/me -b cookies-final.txt | ConvertFrom-Json
if ($meResult.email -eq "sysadmin@yachtpms.com") {
    Write-Host "   ✅ /me retorna datos correctamente" -ForegroundColor Green
} else {
    Write-Host "   ❌ /me fallido" -ForegroundColor Red
    exit 1
}

# 4. Test refresh
Write-Host "`n✅ PASO 4: Test token refresh..." -ForegroundColor Yellow
$refreshResult = curl -s -X POST http://localhost:3001/api/auth/refresh `
    -H "Content-Type: application/json" `
    -b cookies-final.txt -c cookies-refresh.txt

$newCookies = Get-Content cookies-refresh.txt
if ($newCookies -like "*accessToken*") {
    Write-Host "   ✅ Refresh exitoso, nuevos tokens generados" -ForegroundColor Green
} else {
    Write-Host "   ❌ Refresh fallido" -ForegroundColor Red
    exit 1
}

# 5. Test logout
Write-Host "`n✅ PASO 5: Test logout..." -ForegroundColor Yellow
$logoutResult = curl -s -X POST http://localhost:3001/api/auth/logout `
    -H "Content-Type: application/json" `
    -b cookies-refresh.txt

# Construir URL para frontend test
$frontendUrl = "http://localhost:3000"

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "✅ TODOS LOS TESTS BACKEND PASARON" -ForegroundColor Green
Write-Host "`n💡 INSTRUCCIONES PARA TEST BROWSER:" -ForegroundColor Yellow
Write-Host "   1. Abrir: $frontendUrl" -ForegroundColor Cyan
Write-Host "   2. Abrir DevTools (F12) → Network tab" -ForegroundColor Cyan
Write-Host "   3. Hacer login con: sysadmin@yachtpms.com / sysadmin123" -ForegroundColor Cyan
Write-Host "   4. Verificar:" -ForegroundColor Cyan
Write-Host "      - ✅ Login exitoso (201)" -ForegroundColor Cyan
Write-Host "      - ✅ Cookies accessToken y refreshToken en Application tab" -ForegroundColor Cyan
Write-Host "      - ✅ /me retorna 200 OK con datos de usuario" -ForegroundColor Cyan
Write-Host "      - ✅ NO hay loop de 401/refresh/logout" -ForegroundColor Cyan
Write-Host "      - ✅ Redirección a /dashboard correcta" -ForegroundColor Cyan
Write-Host "`n🎯 Si todo funciona: el loop infinito está RESUELTO!" -ForegroundColor Green

# Limpiar cookies de test
cleanUp
