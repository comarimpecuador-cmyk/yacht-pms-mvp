@echo off
echo ========================================
echo TEST COOKIES HTTP-ONLY - COMANDOS CURL
echo ========================================
echo.

set API_URL=http://localhost:3001
set LOGIN_URL=%API_URL%/api/auth/login
set ME_URL=%API_URL%/api/auth/me
set REFRESH_URL=%API_URL%/api/auth/refresh
set LOGOUT_URL=%API_URL%/api/auth/logout

echo API URL: %API_URL%
echo.
echo IMPORTANTE: Asegurar que el servidor esté corriendo:
echo   cd apps/api ^&^& pnpm start:dev
echo.
echo Presione ENTER para continuar...  
pause > nul
echo.

REM Test 1: Login (guarda cookies en archivo cookies.txt)
echo --- TEST 1: Login ---
curl -i -X POST %LOGIN_URL% -H "Content-Type: application/json" -d "{\"email\":\"sysadmin@yachtpms.com\",\"password\":\"sysadmin123\"}" -c cookies.txt
echo.
echo.
echo Presione ENTER para siguiente test...
pause > nul
echo.

REM Test 2: Ver cookies guardadas
echo --- TEST 2: Cookies Guardadas ---
type cookies.txt
echo.
echo.
echo Presione ENTER para siguiente test...
pause > nul
echo.

REM Test 3: Obtener datos de usuario
echo --- TEST 3: Get User Data (/me) ---
curl -i -X GET %ME_URL% -b cookies.txt -H "Content-Type: application/json"
echo.
echo.
echo Presione ENTER para siguiente test...
pause > nul
echo.

REM Test 4: Refresh tokens  
echo --- TEST 4: Refresh Tokens ---
curl -i -X POST %REFRESH_URL% -b cookies.txt
echo.
echo.
echo Presione ENTER para siguiente test...
pause > nul
echo.

REM Test 5: Verificar que las cookies fueron actualizadas (opcional)
echo --- TEST 5: Cookies despues de refresh ---
type cookies.txt
echo.
echo.
echo Presione ENTER para siguiente test...
pause > nul
echo.

REM Test 6: Logout
echo --- TEST 6: Logout ---
curl -i -X POST %LOGOUT_URL% -b cookies.txt
echo.
echo.
echo Presione ENTER para verificar logout...
pause > nul
echo.

REM Test 7: Verificar que /me falla despues de logout
echo --- TEST 7: Verificar Logout (/me deberia fallar) ---
curl -i -X GET %ME_URL% -b cookies.txt -H "Content-Type: application/json"
echo.
echo.

echo ========================================
echo TESTS COMPLETADOS
echo ========================================
echo.
echo Revisar en Network tab del browser que:
echo   1. No se vean tokens en responses (solo success: true)
echo   2. Las cookies tengan flag HttpOnly
echo   3. En Application ^> Cookies se vean accessToken y refreshToken
echo   4. Las peticiones automaticas incluyan cookies (sin headers visibles)
echo.
pause