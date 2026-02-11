# qa-smoke-debug.ps1 - Debug version

$ErrorActionPreference = 'Stop'
$BASE_URL = "http://localhost:3001"

# Test login using file
Write-Host "Testing login..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "$BASE_URL/api/auth/login" -Method Post -ContentType "application/json" -InFile "test-login.json"

Write-Host "Token received: $($login.access_token.Substring(0, 50))..." -ForegroundColor Yellow

# Test with Invoke-WebRequest
Write-Host "`nTesting with Invoke-WebRequest..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/yachts" -Method Get -Headers @{
        "Authorization" = "Bearer $($login.access_token)"
    }
    Write-Host "Success! Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Gray
}

# Test with explicit header construction
Write-Host "`nTesting with explicit header..." -ForegroundColor Yellow
$headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
$headers.Add("Authorization", "Bearer $($login.access_token)")

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/yachts" -Method Get -Headers $headers
    Write-Host "Success! Found $($response.Length) yachts" -ForegroundColor Green
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Gray
}
