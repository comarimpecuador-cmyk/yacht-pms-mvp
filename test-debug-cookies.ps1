# Test de debug - cookies en el backend
# Ejecuta login primero y luego prueba el endpoint debug

Write-Host "🐛 DEBUG COOKIES TEST" -ForegroundColor Cyan
Write-Host "====================="`n

# 1. Login
Write-Host "✅ Paso 1: Haciendo login..." -ForegroundColor Yellow
$login = curl -s -X POST http://localhost:3001/api/auth/login `
    -H "Content-Type: application/json" `
    -d '{"email":"sysadmin@yachtpms.com","password":"sysadmin123"}' `
    -c cookies-debug.txt

if (Test-Path "cookies-debug.txt") {
    Write-Host "   ✅ Login exitoso, cookies guardadas" -ForegroundColor Green
} else {
    Write-Host "   ❌ Login fallido" -ForegroundColor Red
    exit 1
}

# 2. Test /me con cookies
Write-Host "`n✅ Paso 2: Test /me con cookies..." -ForegroundColor Yellow
$me = curl -s -X GET http://localhost:3001/api/auth/me -b cookies-debug.txt | ConvertFrom-Json
if ($me.email) {
    Write-Host "   ✅ /me recibe cookies correctamente" -ForegroundColor Green
    Write-Host "   Email: $($me.email)" -ForegroundColor Cyan
} else {
    Write-Host "   ❌ /me no recibe cookies" -ForegroundColor Red
    Write-Host "   Response: $($me | ConvertTo-Json)" -ForegroundColor Yellow
}

# 3. Test endpoint debug (para comparar con browser)
Write-Host "`n✅ Paso 3: Test endpoint debug..." -ForegroundColor Yellow
$debugResponse = curl -s -X GET http://localhost:3001/api/auth/debug/cookies -b cookies-debug.txt | ConvertFrom-Json
Write-Host "   Debug response:" -ForegroundColor Cyan
Write-Host "   - Cookies recibidas: $($debugResponse.cookiesReceived)" -ForegroundColor Cyan
Write-Host "   - accessToken presente: $($debugResponse.hasAccessToken)" -ForegroundColor Cyan
Write-Host "   - refreshToken presente: $($debugResponse.hasRefreshToken)" -ForegroundColor Cyan

# 4. Ahora test desde browser (instrucciones)
Write-Host "`n=====================" -ForegroundColor Cyan
Write-Host "💻 TEST DESDE BROWSER:" -ForegroundColor Yellow
Write-Host "   1. Abrir: http://localhost:3001/api/auth/debug/cookies" -ForegroundColor Cyan
Write-Host "   2. Debería ver: {\"cookiesReceived\":{},...}" -ForegroundColor Cyan
Write-Host "   3. Hacer login desde http://localhost:3000" -ForegroundColor Cyan
Write-Host "   4. Volver a: http://localhost:3001/api/auth/debug/cookies" -ForegroundColor Cyan
Write-Host "   5. Verificar si muestra accessToken/refreshToken" -ForegroundColor Cyan
Write-Host "`n🔍 DIFERENCIA CLAVE:" -ForegroundColor Yellow
Write-Host "   - Si curl MUESTRA tokens pero browser NO → problema de CORS/browser" -ForegroundColor Cyan
Write-Host "   - Si curl NO muestra tokens → problema de backend" -ForegroundColor Cyan
Write-Host "   - Si ambos NO muestran tokens → cookies nunca se setean" -ForegroundColor Cyan
