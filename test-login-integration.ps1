#!/usr/bin/env pwsh

# Test de Integración: Login + Cookies + Refresh

$API_URL = "http://localhost:4000"
$credentials = '{"email":"captain@yacht.com","password":"pass123"}'

Write-Host "============ TEST DE LOGIN ============" -ForegroundColor Yellow

# Step 1: Login
Write-Host "1. Login..." -ForegroundColor Cyan
try {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $response = Invoke-WebRequest -Uri "$API_URL/api/auth/login" -Method POST -Body $credentials -ContentType "application/json" -WebSession $session
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Cookies: $($session.Cookies.Count)" -ForegroundColor Gray
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Test /me endpoint
Write-Host "2. Test /me (3 calls)..." -ForegroundColor Cyan
$success = 0
for ($i = 1; $i -le 3; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$API_URL/api/auth/me" -Method GET -WebSession $session
        Write-Host "   Call $i: $($r.StatusCode) OK" -ForegroundColor Green
        $success++
    } catch {
        Write-Host "   Call $i: FAILED" -ForegroundColor Red
    }
}

Write-Host "   Total: $success/3 successful" -ForegroundColor ($success -eq 3 ? 'Green' : 'Yellow')

Write-Host ""

# Step 3: Refresh
Write-Host "3. Refresh token..." -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$API_URL/api/auth/refresh" -Method POST -WebSession $session
    Write-Host "   Status: $($r.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# Step 4: Logout
Write-Host "4. Logout..." -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$API_URL/api/auth/logout" -Method POST -WebSession $session
    Write-Host "   Status: $($r.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Test complete!" -ForegroundColor Green