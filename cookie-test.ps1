# Test del backend con cookies HTTP-Only
Write-Host "Probando backend con curl..."

# Crear body JSON
$body = '{"email":"admin@yachtclub.ca","password":"password123"}'

# Test login - debería devolver cookies
Write-Host "`nLogin test:"
curl -X POST http://localhost:4000/api/auth/login `
  -H "Content-Type: application/json" `
  -d $body `
  -v

# Test me endpoint (necesita cookies)
Write-Host "`n`nMe endpoint (con cookies guardadas):"

# Guardar cookies y usar para siguiente request
$loginResponse = curl -X POST http://localhost:4000/api/auth/login `
  -H "Content-Type: application/json" `
  -d $body `
  -c cookies.txt

# Leer el accessToken de las cookies guardadas
curl -X GET http://localhost:4000/api/auth/me `
  -b cookies.txt `
  -H "Content-Type: application/json" `
  -v

Write-Host "`nPrueba completada!"